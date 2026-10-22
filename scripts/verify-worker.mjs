import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
if(!process.env.DISCOVERY_DATA_DIR?.includes('discovery-verification-'))throw Error('Set the isolated verification data directory first.');
const {list,enqueue,config,setConfig,get,jobs}=await import('../lib/db.mjs');
setConfig('worker',{running:false,at:0});
const lead=list('lead').find(l=>l.website==='https://example.com/');assert.ok(lead);const id=enqueue('audit',{leadId:lead.id});
const child=spawn(process.execPath,['scripts/worker.mjs','--once'],{env:process.env,stdio:'inherit',windowsHide:true});
await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
const job=jobs().find(j=>j.id===id);assert.equal(job.status,'completed',job.error);const report=get(get(lead.id).reportId);assert.equal(report.mobile.categories.length,4);assert.equal(report.desktop.categories.length,4);assert.ok(report.findings.length);console.log('PASS: live website research and mobile/desktop Lighthouse reports saved.');
