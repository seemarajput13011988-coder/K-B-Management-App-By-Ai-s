import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import { apiHandler } from './api-handler.js';
import { handler as legacyHandler } from './legacy-routes.js';
import { runScheduledTick, startBackgroundJobs } from './jobs.js';
const app=express();
app.disable('x-powered-by');
app.use(cors({origin:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'2mb'}));
const useFirestoreSessionApi=(path:string)=>
  /^\/api\/(auth|admins|staff-registration-requests|retention|customer-ledger|invoices|audit|visits|subscriptions|notifications|push-tokens|payroll|inventory|installations)(\/|$)/.test(path)||path==='/api/_healthcheck';
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
