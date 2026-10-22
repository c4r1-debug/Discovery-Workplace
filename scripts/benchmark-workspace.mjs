// Local performance verification against a disposable online database snapshot.
import assert from 'node:assert/strict';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
assert.ok(path.basename(process.env.DISCOVERY_DATA_DIR||'').startsWith('performance-preview-'),'Use a disposable performance-preview snapshot.');
const base=process.argv[2]||'http://127.0.0.1:3103';
assert.equal(base,'http://127.0.0.1:3103','This check targets only the isolated preview.');
const {register}=await import('../lib/accounts.mjs');
const {login}=await import('../lib/auth.mjs');
const {default:db}=await import('../lib/db.mjs');
if(!db.prepare('SELECT name FROM users WHERE name=?').get('ui-review'))register('ui-review','temporary-ui-review-only');
const cookie='discovery_session='+login('ui-review','temporary-ui-review-only');
try{
 for(const query of ['view=discover','view=prospects','view=prospects&q=Dental','view=prospects&page=600','view=schedule','view=reports','view=settings','']){
  const samples=[];let bytes=0,total=0;
  for(let i=0;i<3;i++){
   const start=performance.now(),response=await fetch(base+'/api/workspace?'+query,{headers:{Cookie:cookie}});
   const text=await response.text();assert.equal(response.status,200,text.slice(0,200));
   samples.push(performance.now()-start);bytes=Buffer.byteLength(text);total=JSON.parse(text).stats.total;
  }
  console.log(JSON.stringify({query:query||'legacy full response',medianMs:Math.round(samples.sort((a,b)=>a-b)[1]),bytes,total}));
 }
}finally{db.close();}
