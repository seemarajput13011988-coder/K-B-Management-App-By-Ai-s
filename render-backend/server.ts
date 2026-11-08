import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import { apiHandler } from './api-handler.js';
import { handler as legacyHandler } from './legacy-routes.js';
import { runScheduledTick, startBackgroundJobs } from './jobs.js';
import { buildOtaDecision, isValidOtaManifest } from './ota.js';
const app=express();
app.disable('x-powered-by');
app.use(cors({origin:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'16mb'}));

let otaReleaseCache: { expiresAt: number; manifest: unknown; bundleUrl: string | null } | null = null;
async function getLatestOtaRelease() {
  if (otaReleaseCache && otaReleaseCache.expiresAt > Date.now()) return otaReleaseCache;
  const releasesResponse = await fetch('https://api.github.com/repos/seemarajput13011988-coder/K-B-Management-App-By-Ai-s/releases?per_page=20', {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(8000),
  });
  if (!releasesResponse.ok) throw new Error('OTA release index is temporarily unavailable.');
  const releases = await releasesResponse.json() as Array<any>;
  const release = releases.find(item =>
    item && !item.draft && !item.prerelease && typeof item.tag_name === 'string'
    && item.tag_name.startsWith('nexus-ota-')
  );
  if (!release) {
    otaReleaseCache = { expiresAt: Date.now() + 300000, manifest: null, bundleUrl: null };
    return otaReleaseCache;
  }
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const manifestAsset = assets.find((asset: any) => asset?.name === 'ota-manifest.json');
  const bundleAsset = assets.find((asset: any) => asset?.name === 'nexus-update.zip');
  if (!manifestAsset?.browser_download_url || !bundleAsset?.browser_download_url) {
    throw new Error('The latest OTA release is missing its manifest or bundle.');
  }
  const manifestResponse = await fetch(manifestAsset.browser_download_url, {
    headers: { Accept: 'application/octet-stream' },
    signal: AbortSignal.timeout(8000),
  });
  if (!manifestResponse.ok) throw new Error('The OTA release manifest could not be read.');
  const manifest = await manifestResponse.json();
  if (!isValidOtaManifest(manifest)) throw new Error('The OTA release manifest failed validation.');
  otaReleaseCache = { expiresAt: Date.now() + 300000, manifest, bundleUrl: bundleAsset.browser_download_url };
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
app.use((req,res)=>{void apiHandler(req,res);});


const port=Number(process.env.PORT||10000);
startBackgroundJobs();
app.listen(port,'0.0.0.0',()=>console.log('K&B Management Nexus API listening on '+port));
