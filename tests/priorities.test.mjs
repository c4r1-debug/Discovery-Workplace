import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-priorities-'));
const {default:db,dataDir,get,put,list,config,setConfig,enqueue,jobs,saveSecret,secret}=await import('../lib/db.mjs');
const {register}=await import('../lib/accounts.mjs');
const {normalize,patchLead}=await import('../lib/leads.mjs');
const {criteria,qualification,updateWorkflow,applyResearch,brief,handoffPreview,history}=await import('../lib/workflow.mjs');
const {progress,logProgress,retryJob,workerControl,finishCampaign}=await import('../lib/progress.mjs');
const {createBackup,restoreBackup,backups}=await import('../lib/backups.mjs');
const {runDiscovery}=await import('../lib/discovery-run.mjs');
const {queueDueCampaigns}=await import('../lib/scheduler.mjs');
const {campaignOptions,upcoming}=await import('../lib/operations.mjs');
register('owner','test-only-password-123');
test('manual contacts survive research, evidence and qualification gate the exact handoff',()=>{
 const lead=normalize({title:'Example practice',website:'https://example.com',email:'office@example.com'});put('lead',lead);
 patchLead(lead.id,{email:'corrected@example.com',owner:'Pat Example',ownerSource:'https://example.com/team',status:'Interested'});
 const updated=applyResearch(get(lead.id),{findings:[],score:0,ownerCandidates:[],checkedAt:new Date().toISOString(),emails:['scraped@example.com'],emailSource:'https://example.com'});
 assert.equal(updated.email,'corrected@example.com');assert.equal(qualification(updated).ready,false);put('lead',updated);
 updateWorkflow(lead.id,{assignedTo:'owner',contactType:'Named owner',service:'Website redesign',qualification:Object.fromEntries(criteria().map(k=>[k,true]))},'owner');
 assert.equal(qualification(get(lead.id)).ready,true);assert.equal(history(lead.id).length,1);assert.match(handoffPreview(get(lead.id)).description,/Website redesign/);
 assert.throws(()=>updateWorkflow(lead.id,{assignedTo:'unknown'},'owner'),/teammate/);
 assert.match(brief({...get(lead.id),websiteBlocked:{}})[0].meaning,/unknown/);
 setConfig('qualificationCriteria',[...criteria(),'Budget discussed']);assert.equal(qualification(get(lead.id)).ready,false);
});
test('progress, interrupted CSV resume and import deduplication retain earlier work',async()=>{
 setConfig('settings',{gosomMode:'docker'});
 const c={id:crypto.randomUUID(),keyword:'Example',location:'Test',batch:2,target:3,emptyStop:2,enabled:false};put('campaign',c);
 const id=enqueue('discovery',c),dir=path.join(dataDir,'jobs',id);mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'results.csv'),'title,place_id\nResume One,resume-a\n');
 db.prepare("UPDATE jobs SET status='interrupted' WHERE id=?").run(id);retryJob(id);
 await runDiscovery(jobs().find(j=>j.id===id),async(binary,args)=>{assert.ok(args.includes('-resume'));writeFileSync(path.join(dir,'results.csv'),'title,place_id\nResume One,resume-a\nResume Two,resume-b\n');});
 assert.equal(list('lead').filter(l=>l.placeId.startsWith('resume-')).length,2);assert.equal(get(c.id).totalAdded,2);
 logProgress(id,JSON.stringify({message:'7 places found'}));assert.equal(jobs().find(j=>j.id===id).body.progress.found,7);
 assert.throws(()=>campaignOptions({...c},c),/active batch/);
 finishCampaign({id:crypto.randomUUID(),body:c},{added:1});assert.equal(get(c.id).enabled,false);assert.equal(get(c.id).stopReason,'Total target reached');
 const empty={...c,id:crypto.randomUUID(),target:null,totalAdded:0,enabled:true,nextRun:new Date(0).toISOString()};put('campaign',empty);finishCampaign({id:crypto.randomUUID(),body:empty},{added:0});finishCampaign({id:crypto.randomUUID(),body:empty},{added:0});assert.equal(get(empty.id).enabled,false);assert.equal(upcoming(empty).length,5);
});
test('backup restore preserves data, credentials and scraper files, invalidates sessions and keeps worker paused',()=>{
 workerControl({paused:true});saveSecret('ai','test-secret');
 const saved=list('lead').length;const snapshot=createBackup();assert.ok(backups().some(b=>b.id===snapshot.id));
 put('lead',normalize({title:'Added after backup'}));saveSecret('ai','changed-secret');
 const restored=restoreBackup(snapshot.id);assert.ok(restored.safetyBackup);assert.equal(list('lead').length,saved);assert.equal(secret('ai'),'test-secret');assert.equal(config('workerControl').paused,true);
 assert.equal(db.prepare("SELECT count(*) n FROM jobs WHERE status IN ('running','queued')").get().n,0);
 assert.throws(()=>restoreBackup('../outside'),/not found/);
});
test('ClickUp handoff uses the preview content and does not duplicate successful or uncertain sends',async()=>{
 const {sendClickup}=await import('../lib/integrations.mjs');
 const lead=normalize({title:'Handoff test',email:'test@example.com'});lead.status='Interested';lead.qualification=Object.fromEntries(criteria().map(c=>[c,true]));put('lead',lead);
 setConfig('settings',{clickupList:'test-list'});saveSecret('clickup','not-a-real-token');
 const original=globalThis.fetch;let calls=0;const expected=handoffPreview(lead);
 try{globalThis.fetch=async(url,options)=>{calls++;assert.deepEqual(JSON.parse(options.body),{name:expected.name,description:expected.description});return new Response(JSON.stringify({id:'fake-task',url:'https://app.clickup.com/t/fake-task'}),{status:200});};await sendClickup(lead.id);await sendClickup(lead.id);assert.equal(calls,1);
 const uncertain={...lead,id:crypto.randomUUID()};put('lead',uncertain);globalThis.fetch=async()=>new Response('Temporary error',{status:500});await assert.rejects(sendClickup(uncertain.id),/HTTP 500/);assert.equal(get(uncertain.id).clickupPending,true);await assert.rejects(sendClickup(uncertain.id),/verification/);
 }finally{globalThis.fetch=original;}
});
