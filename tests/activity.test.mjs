import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-activity-'));
const {put,get,enqueue,updateJob,jobs,list}=await import('../lib/db.mjs');
const {jobLinks,deleteSearches,timedJobs}=await import('../lib/activity.mjs');
const {importLeads}=await import('../lib/leads.mjs');
test('search deletion is reversible and retains leads/jobs; bulk validation is atomic',()=>{
put('campaign',{id:'c1',enabled:true});put('campaign',{id:'c2',enabled:true});put('lead',{id:'l1',name:'Existing',address:'First Street'});const job=enqueue('discovery',{id:'c1'});
assert.throws(()=>deleteSearches(['c1','l1']));assert.equal(get('c1').enabled,true);
deleteSearches(['c1','c2']);assert.ok(get('c1').deletedAt);assert.equal(get('c2').enabled,false);assert.ok(get('l1'));assert.ok(jobs().find(j=>j.id===job));
deleteSearches(['c1'],true);assert.equal(get('c1').deletedAt,null);assert.equal(get('c1').enabled,false);
});
test('job timing distinguishes queued and completed execution',()=>{const id=enqueue('research',{leadId:'timer'});assert.equal(timedJobs(jobs()).find(j=>j.id===id).startedAt,null);updateJob(id,'running');updateJob(id,'completed');const j=timedJobs(jobs()).find(j=>j.id===id);assert.ok(j.startedAt);assert.ok(j.finishedAt);});
test('batch links retain both newly imported and already existing prospects',()=>{const csv='title,address\nExample Practice,Main Street';importLeads(csv,5,'batch1');importLeads(csv,5,'batch2');assert.equal(jobLinks().filter(l=>l.jobId.startsWith('batch')).length,2);assert.equal(jobLinks().find(l=>l.jobId==='batch1').leadId,jobLinks().find(l=>l.jobId==='batch2').leadId);});
