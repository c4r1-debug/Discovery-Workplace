// Isolated real scraper regression: does not import into the user's workspace.
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-live-batch-'));
const {setConfig,enqueue,jobs,list}=await import('../lib/db.mjs');
const {runDiscovery}=await import('../lib/discovery-run.mjs');
setConfig('settings',{gosomMode:'binary',gosomBinary:path.resolve('tools/google-maps-scraper.exe')});
const id=enqueue('discovery',{keyword:'dentist',location:'Philadelphia, Pennsylvania, United States',batch:1000});
console.log('Testing full Philadelphia search in isolated data directory:',process.env.DISCOVERY_DATA_DIR);
await runDiscovery(jobs().find(j=>j.id===id),(binary,args,timeout)=>new Promise((resolve,reject)=>{
 const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stdout.write(d));
 const timer=setTimeout(()=>{child.kill();reject(Error('Regression test exceeded 10 minutes.'));},Math.min(timeout,600000));
 child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Scraper exit '+code));});
}));
const count=list('lead').length;if(!count)throw Error('No leads saved.');
console.log('PASS: Full search saved',count,'prospects in isolated storage.');
