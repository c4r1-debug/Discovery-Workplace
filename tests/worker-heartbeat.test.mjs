import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-heartbeat-'));
const {config,setConfig}=await import('../lib/db.mjs');
const {workerHeartbeat,tickWorkerHeartbeat}=await import('../lib/progress.mjs');
const {isWorkerOnline}=await import('../lib/worker-status.mjs');

test('heartbeat protects fresh ownership and stays online until graceful shutdown finishes',()=>{
 const now=100000;
 setConfig('worker',{id:'first',at:now-1000,running:true});
 assert.throws(()=>workerHeartbeat('second',false,now),/Another Discovery worker is running/);
 assert.equal(config('worker').id,'first');
 workerHeartbeat('first',true,now);
 assert.deepEqual(config('worker'),{id:'first',at:now,running:true,stopping:true});
 assert.equal(isWorkerOnline(config('worker'),now),true);
 assert.throws(()=>workerHeartbeat('second',false,now),/Another Discovery worker is running/);
});

test('heartbeat can claim a stale or actually stopped lease',()=>{
 const now=100000;
 for(const previous of [{id:'first',at:now-45000,running:true},{id:'first',at:now,running:false}]){
  setConfig('worker',previous);
  workerHeartbeat('second',false,now);
  assert.deepEqual(config('worker'),{id:'second',at:now,running:true,stopping:false});
 }
});

test('heartbeat ticks tolerate transient SQLite errors and retry on the next tick',()=>{
 const logs=[],original=console.error;
 console.error=(...args)=>logs.push(args);
 try{
  for(const errcode of [5,6,10,261,262,266]){
   let attempts=0;
   const error=Object.assign(Error('Temporary database error'),{code:'ERR_SQLITE_ERROR',errcode});
   const heartbeat=(id,stopping)=>{assert.equal(id,'first');assert.equal(stopping,true);if(++attempts===1)throw error;};
   assert.doesNotThrow(()=>tickWorkerHeartbeat('first',true,heartbeat));
   tickWorkerHeartbeat('first',true,heartbeat);
   assert.equal(attempts,2);
  }
  assert.equal(logs.length,6);
  assert.ok(logs.every(args=>args[0]==='Worker heartbeat delayed:'));
 }finally{console.error=original;}
});

test('heartbeat ticks retain ownership and unknown failures as fatal errors',()=>{
 for(const error of [Error('Another Discovery worker is running.'),Error('Unexpected failure'),Object.assign(Error('Constraint failed'),{code:'ERR_SQLITE_ERROR',errcode:19}),Object.assign(Error('Other database error'),{code:'OTHER_ERROR',errcode:5})]){
  assert.throws(()=>tickWorkerHeartbeat('first',false,()=>{throw error;}),caught=>caught===error);
 }
});
