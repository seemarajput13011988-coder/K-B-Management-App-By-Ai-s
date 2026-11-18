import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import { apiHandler } from './api-handler.js';
import { handler as legacyHandler } from './legacy-routes.js';
import { runScheduledTick, startBackgroundJobs } from './jobs.js';
import { firestore, businessContext } from './firestore-adapter.js';
const app=express();
app.disable('x-powered-by');
// Give every HTTP request its own async business context to prevent tenant scope leaking across requests.
app.use((req,res,next)=>businessContext.run('',()=>next()));
app.use(cors({origin:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'16mb'}));

app.get('/api/_readycheck', async (_req, res) => {
  try {
    await firestore.collection('users').limit(1).get();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({ status: 'ready', database: 'reachable' });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    console.error('[VYPAAR_READY_CHECK_FAILED]', JSON.stringify({ code: typeof code === 'string' || typeof code === 'number' ? code : 'unknown' }));
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(503).json({ status: 'not_ready', error: 'Vypaar database access is unavailable. Check the Render service account permissions.' });
  }
});

// Vypaar OTA publishing is intentionally disabled until its dedicated release channel is configured.
const useFirestoreSessionApi=(path:string)=>
  !/^\/api\/staff\/(?:live-location|[^/]+\/live-location)$/.test(path) &&
  (/^\/api\/(auth|admins|staff|staff-registration-requests|retention|customer-ledger|invoices|audit|visits|subscriptions|notifications|push-tokens|payroll|inventory|installations)(\/|$)/.test(path)||path==='/api/_healthcheck');
app.use((req,res,next)=>{if(!useFirestoreSessionApi(req.path))return next();void apiHandler(req,res).catch(next);});
app.post('/internal/jobs/tick', async (req,res) => {
  const expected=process.env.JOB_SECRET||'';
  const received=String(req.header('x-vypaar-job-secret')||'');
  const a=Buffer.from(expected), b=Buffer.from(received);
  if (!expected || a.length!==b.length || !timingSafeEqual(a,b)) { res.status(401).json({error:'Unauthorized job trigger.'}); return; }
  try { const result=await runScheduledTick(); res.status(200).json({ok:true,...result,checkedAt:new Date().toISOString()}); }
  catch (error) { console.error('Scheduled tick failed:',error instanceof Error?error.message:String(error)); res.status(500).json({error:'Scheduled check failed.'}); }
});
app.use(legacyHandler);
app.use((req,res,next)=>{void apiHandler(req,res).catch(next);});
app.use((error: any, req: any, res: any, next: any) => {
  const code = error && typeof error === 'object' ? error.code : undefined;
  console.error('[VYPAAR_API_REQUEST_FAILED]', JSON.stringify({
    method: String(req.method || ''),
    path: String(req.path || ''),
    code: typeof code === 'string' || typeof code === 'number' ? code : 'unknown',
  }));
  if (res.headersSent) return next(error);
  if (code === 7 || code === 'permission-denied') {
    res.status(503).json({ error: 'Vypaar database access is unavailable. The administrator must check the Render service account permissions.' });
    return;
  }
  res.status(500).json({ error: 'Vypaar server encountered an error. Please retry.' });
});


const port=Number(process.env.PORT||10000);
startBackgroundJobs();
app.listen(port,'0.0.0.0',()=>console.log('Vypaar Management API listening on '+port));
