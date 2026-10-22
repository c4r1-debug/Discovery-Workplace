import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateSchedule,allowedAt,nextAllowed,followingRun,localStart} from '../lib/schedule.mjs';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-batches-'));
const {default:db,put,get,enqueue,jobs,setConfig}=await import('../lib/db.mjs');
const {queueDueCampaigns,scheduledJobReady}=await import('../lib/scheduler.mjs');
const {runDiscovery,scraperArgs}=await import('../lib/discovery-run.mjs');
const schedule=validateSchedule({timezone:'America/New_York',startLocal:'2026-09-21T09:00',every:1,unit:'days',days:[1,2,3,4,5],from:'09:00',to:'17:00'});
test('time zones, windows, weekends and DST are respected',()=>{
 assert.equal(schedule.startAt,'2026-09-21T13:00:00.000Z');
 assert.equal(allowedAt(schedule,'2026-09-21T21:00:00Z'),false);
 assert.equal(nextAllowed(schedule,'2026-09-25T21:00:00Z'),'2026-09-28T13:00:00.000Z');
 assert.equal(followingRun(schedule,'2026-09-25T13:00:00Z'),'2026-09-28T13:00:00.000Z');
 assert.throws(()=>localStart('2026-03-08T02:30','America/New_York'),/does not exist/);
 assert.equal(localStart('2026-11-02T09:00','America/New_York'),'2026-11-02T14:00:00.000Z');
 assert.throws(()=>validateSchedule({timezone:'UTC',startLocal:'2026-09-21T09:00',every:1,unit:'days',days:[]}),/at least one/);
});
test('missed runs collapse, active batches do not overlap, paused schedules cancel queued work',()=>{
 const c={id:crypto.randomUUID(),keyword:'Dentist',location:'Test',batch:2,schedule,enabled:true,nextRun:schedule.startAt};put('campaign',c);
 const now=Date.parse('2026-09-24T14:00:00Z');queueDueCampaigns(now);queueDueCampaigns(now+60000);
 const queued=jobs().filter(j=>j.body.id===c.id);assert.equal(queued.length,1);assert.equal(get(c.id).nextRun,'2026-09-25T14:00:00.000Z');
 assert.equal(scheduledJobReady(queued[0],Date.parse('2026-09-24T22:00:00Z')),false);
 put('campaign',{...get(c.id),enabled:false});assert.equal(scheduledJobReady(queued[0],now),false);assert.equal(jobs().find(j=>j.id===queued[0].id).status,'cancelled');
});
test('later batches consume saved results without scraping again; empty output fails',async()=>{
 setConfig('settings',{gosomMode:'docker'});
 const c={id:crypto.randomUUID(),keyword:'Example',location:'Test',batch:2,schedule,enabled:false};put('campaign',c);
 let calls=0;
 const command=async(binary,args,timeout,log)=>{calls++;assert.ok(args.includes('0'));writeFileSync(path.join(path.dirname(log),'results.csv'),'title,address,place_id\nOne,Test,a\nTwo,Test,b\nThree,Test,c\n');};
 const first=enqueue('discovery',c);await runDiscovery(jobs().find(j=>j.id===first),command);assert.equal(get(c.id).poolRemaining,1);
 const second=enqueue('discovery',get(c.id));await runDiscovery(jobs().find(j=>j.id===second),command);assert.equal(calls,1);assert.equal(get(c.id).poolRemaining,0);assert.equal(jobs().find(j=>j.id===second).body.result.added,1);
 const empty=enqueue('discovery',{keyword:'Empty',location:'Test',batch:5});await assert.rejects(runDiscovery(jobs().find(j=>j.id===empty),async()=>{}),/saved no businesses/);
 assert.deepEqual(scraperArgs('in','out',67).slice(-2),['-exit-on-inactivity','0']);
});
