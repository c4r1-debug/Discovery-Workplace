import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {regionAreas} from '../lib/locations.mjs';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-fast-'));
const {get,put,list,enqueue,jobs,setConfig}=await import('../lib/db.mjs');
const {runDiscovery,csvSnapshot}=await import('../lib/discovery-run.mjs');
setConfig('settings',{gosomMode:'docker'});
test('region directory, live imports, partial failure recovery, caps and recent-area reuse',async()=>{
 const nj=regionAreas('New Jersey, USA');assert.ok(nj.length>10);assert.ok(nj.every(v=>v.endsWith(', New Jersey, United States')));assert.throws(()=>regionAreas('No such region'));
 const c={id:crypto.randomUUID(),keyword:'Dentist',location:'Test region',scope:'region',areas:['Area A','Area B'],batch:2,concurrency:2};put('campaign',c);
 const first=enqueue('discovery',c);let calls=0;
 await runDiscovery(jobs().find(j=>j.id===first),async(binary,args,timeout,log,controls)=>{
  calls++;assert.equal(args[args.indexOf('-c')+1],'2');const file=path.join(path.dirname(log),'results.csv');
  writeFileSync(file,'title,place_id,website\nFirst,fast-one,https://example.com\n');assert.equal(controls.poll(),null);
  assert.equal(list('lead').length,1);assert.equal(jobs().some(j=>j.type==='research'),false);
  writeFileSync(file,'title,place_id,website\nFirst,fast-one,https://example.com\nSecond,fast-two,\nThird,fast-three,\n');assert.equal(controls.poll(),'Batch limit reached');return {stopped:'Batch limit reached'};
 });
 assert.equal(list('lead').length,2);assert.equal(get(c.id).totalAdded,2);assert.equal(get(c.id).areaState[0].status,'pending');
 const second=enqueue('discovery',{...get(c.id),batch:5});
 await assert.rejects(runDiscovery(jobs().find(j=>j.id===second),async(binary,args,timeout,log)=>{
  const file=path.join(path.dirname(log),'results.csv');
  if(file.includes('area-0')){assert.ok(args.includes('-resume'));return;}
  writeFileSync(file,'title,place_id\nFourth,fast-four\n');throw Error('Simulated interruption');
 }),/incomplete/);
 assert.equal(list('lead').length,4);assert.equal(get(c.id).totalAdded,4);assert.equal(get(c.id).areaState[0].status,'completed');assert.equal(get(c.id).areaState[1].status,'incomplete');
 const third=enqueue('discovery',{...get(c.id),batch:5});let retried=0;
 await runDiscovery(jobs().find(j=>j.id===third),async(binary,args,timeout,log)=>{retried++;assert.ok(log.includes('area-1'));assert.ok(args.includes('-resume'));});
 assert.equal(retried,1);assert.equal(get(c.id).totalAdded,4);
 const fourth=enqueue('discovery',{...get(c.id),batch:5});await runDiscovery(jobs().find(j=>j.id===fourth),async()=>assert.fail('Recent complete areas should not run again'));
 const csv=path.join(process.env.DISCOVERY_DATA_DIR,'partial.csv');writeFileSync(csv,'title,place_id\n"unfinished\n');assert.equal(csvSnapshot(csv),null);
 assert.equal(calls,1);
});
