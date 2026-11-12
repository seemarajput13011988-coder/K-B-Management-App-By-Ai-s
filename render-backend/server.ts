import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import { apiHandler } from './api-handler.js';
import { handler as legacyHandler } from './legacy-routes.js';
import { runScheduledTick, startBackgroundJobs } from './jobs.js';
import { buildOtaDecision, isValidOtaManifest } from './ota.js';
import { firestore } from './firestore-adapter.js';
const app=express();
app.disable('x-powered-by');
app.use(cors({origin:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'16mb'}));

app.get('/api/_readycheck', async (_req, res) => {
  try {
    await firestore.collection('users').limit(1).get();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({ status: 'ready', database: 'reachable' });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    console.error('[K&B_READY_CHECK_FAILED]', JSON.stringify({ code: typeof code === 'string' || typeof code === 'number' ? code : 'unknown' }));
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(503).json({ status: 'not_ready', error: 'K&B database access is unavailable. Check the Render service account permissions.' });
  }
});

let otaReleaseCache: { expiresAt: number; manifest: unknown; bundleUrl: string | null } | null = null;
async function getLatestOtaRelease() {
  if (otaReleaseCache && otaReleaseCache.expiresAt > Date.now()) return otaReleaseCache;
  // Use GitHub's latest-release asset redirect instead of the rate-limited releases API.
  // The OTA workflow publishes both assets together on every production main push.
  const releaseBase = 'https://github.com/seemarajput13011988-coder/K-B-Management-App-By-Ai-s/releases/latest/download';
  const manifestResponse = await fetch(releaseBase + '/ota-manifest.json', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!manifestResponse.ok) {
    throw new Error('The latest OTA release manifest could not be read (HTTP ' + manifestResponse.status + ').');
  }
  const manifest = await manifestResponse.json();
  if (!isValidOtaManifest(manifest)) throw new Error('The OTA release manifest failed validation.');
  const bundleUrl = releaseBase + '/nexus-update.zip';
  otaReleaseCache = { expiresAt: Date.now() + 300000, manifest, bundleUrl };
  return otaReleaseCache;
}

app.post('/api/app-updates/check', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Content-Type');
  const info = req.body || {};
  if (info.app_id !== 'kandbnet.service2010' || info.platform !== 'android') {
    res.status(400).json({ message: 'Unsupported Nexus app or platform.' });
    return;
  }
  try {
    const release = await getLatestOtaRelease();
    const decision = buildOtaDecision(info.version_name, release.manifest as any, release.bundleUrl);
    res.status(200).json(decision);
  } catch (error) {
    console.error('Nexus OTA check failed:', error instanceof Error ? error.message : String(error));
    res.status(503).json({ message: 'The update service is temporarily unavailable.' });
  }
});
const useFirestoreSessionApi=(path:string)=>
  !/^\/api\/staff\/(?:live-location|[^/]+\/live-location)$/.test(path) &&
  (/^\/api\/(auth|admins|staff|staff-registration-requests|retention|customer-ledger|invoices|audit|visits|subscriptions|notifications|push-tokens|payroll|inventory|installations)(\/|$)/.test(path)||path==='/api/_healthcheck');
app.use((req,res,next)=>{if(!useFirestoreSessionApi(req.path))return next();void apiHandler(req,res).catch(next);});
app.post('/internal/jobs/tick', async (req,res) => {
  const expected=process.env.JOB_SECRET||'';
  const received=String(req.header('x-kb-job-secret')||'');
  const a=Buffer.from(expected), b=Buffer.from(received);
  if (!expected || a.length!==b.length || !timingSafeEqual(a,b)) { res.status(401).json({error:'Unauthorized job trigger.'}); return; }
  try { const result=await runScheduledTick(); res.status(200).json({ok:true,...result,checkedAt:new Date().toISOString()}); }
  catch (error) { console.error('Scheduled tick failed:',error instanceof Error?error.message:String(error)); res.status(500).json({error:'Scheduled check failed.'}); }
});
app.use(legacyHandler);
app.use((req,res,next)=>{void apiHandler(req,res).catch(next);});
app.use((error: any, req: any, res: any, next: any) => {
  const code = error && typeof error === 'object' ? error.code : undefined;
  console.error('[K&B_API_REQUEST_FAILED]', JSON.stringify({
    method: String(req.method || ''),
    path: String(req.path || ''),
    code: typeof code === 'string' || typeof code === 'number' ? code : 'unknown',
  }));
  if (res.headersSent) return next(error);
  if (code === 7 || code === 'permission-denied') {
    res.status(503).json({ error: 'K&B database access is unavailable. The administrator must check the Render service account permissions.' });
    return;
  }
  res.status(500).json({ error: 'K&B server encountered an error. Please retry.' });
});


const port=Number(process.env.PORT||10000);
startBackgroundJobs();
app.listen(port,'0.0.0.0',()=>console.log('K&B Management Nexus API listening on '+port));
