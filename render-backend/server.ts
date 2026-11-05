import express from 'express';
import cors from 'cors';
import { apiHandler } from './api-handler.js';
import { handler as legacyHandler } from './legacy-routes.js';
const app=express();
app.disable('x-powered-by');
app.use(cors({origin:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'2mb'}));
const useFirestoreSessionApi=(path:string)=>
  /^\/api\/(auth|admins|staff-registration-requests|retention|customer-ledger|invoices|audit|visits|subscriptions|notifications|push-tokens|payroll|inventory|installations)(\/|$)/.test(path)||path==='/api/_healthcheck';
app.use((req,res,next)=>{if(!useFirestoreSessionApi(req.path))return next();void apiHandler(req,res).catch(next);});
app.use(legacyHandler);
app.use((req,res)=>{void apiHandler(req,res);});
const port=Number(process.env.PORT||10000);
app.listen(port,'0.0.0.0',()=>console.log('K&B Management Nexus API listening on '+port));
