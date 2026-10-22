// Disposable, synthetic workspace for manual UI verification. No scraper worker is started.
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-ui-'));
const {put,enqueue,updateJob}=await import('../lib/db.mjs');
const {register}=await import('../lib/accounts.mjs');
const {normalize}=await import('../lib/leads.mjs');
const {linkLead}=await import('../lib/activity.mjs');
register('ui-review','temporary-ui-review-only');
const job=enqueue('discovery',{keyword:'Demo practices',location:'Test region',result:{added:65,duplicates:0,remaining:0}});
updateJob(job,'running');updateJob(job,'completed');
for(let i=1;i<=65;i++){
 const lead=normalize({name:`Demo Practice ${String(i).padStart(2,'0')}`,address:'Synthetic preview location',email:'hello@example.com',rating:4.5,reviews:25});
 lead.status='Ready for review';put('lead',lead);linkLead(job,lead.id);
 if(i===65){const research=enqueue('research',{leadId:lead.id});updateJob(research,'running');updateJob(research,'completed');}
}
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3102'],{env:process.env,stdio:'inherit',windowsHide:true});
process.on('SIGINT',()=>{server.kill();process.exit();});
server.on('exit',code=>process.exit(code||0));
