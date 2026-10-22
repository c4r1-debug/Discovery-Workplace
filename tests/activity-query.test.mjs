import test from 'node:test';
import assert from 'node:assert/strict';
import {activityPage} from '../lib/activity-query.mjs';
test('job search is paginated, searches history fields and hides linked research',()=>{
 const jobs=Array.from({length:25},(_,i)=>({id:String(i),type:'discovery',status:i===20?'failed':'completed',body:{keyword:'Dentist',location:i===20?'New Jersey':'Texas'}}));
 jobs.push({id:'hidden',type:'research',linked:true,body:{}},{id:'other',type:'preview',status:'completed',body:{keyword:'Marketing'}});
 assert.equal(activityPage(jobs).jobs.length,10);assert.equal(activityPage(jobs).total,26);
 assert.equal(activityPage(jobs,'',2).jobs[0].id,'10');assert.equal(activityPage(jobs,'',99).page,3);
 assert.equal(activityPage(jobs,' NEW JERSEY ',3).jobs[0].id,'20');assert.equal(activityPage(jobs,'failed').total,1);
 assert.equal(activityPage(jobs,'preview').jobs[0].id,'other');assert.equal(activityPage(jobs,'Dentist').total,25);
 assert.deepEqual(activityPage(jobs,'nothing'),{jobs:[],total:0,page:1,pages:1});
});
