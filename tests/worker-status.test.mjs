import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isWorkerOnline} from '../lib/worker-status.mjs';

test('worker health retains the existing 45-second heartbeat deadline',()=>{
 const now=100000;
 assert.equal(isWorkerOnline({running:true,at:now},now),true);
 assert.equal(isWorkerOnline({running:true,at:now-44999},now),true);
 assert.equal(isWorkerOnline({running:true,at:now-45000},now),false);
 assert.equal(isWorkerOnline({running:false,at:now},now),false);
 assert.equal(isWorkerOnline(null,now),false);
 assert.equal(isWorkerOnline(undefined,now),false);
 assert.equal(isWorkerOnline({running:true},now),false);
});

test('both worker indicators preserve server health between workspace polls',()=>{
 const worker={running:true,at:0};
 const snapshot={worker,workerOnline:isWorkerOnline(worker,40000)};
 // Re-evaluating this cached heartbeat at 50 seconds used to falsely show offline.
 const cachedWorkerOnline=record=>isWorkerOnline(record,50000);
 for(const file of ['../app/page.jsx','../app/workflow.jsx']){
  const source=readFileSync(new URL(file,import.meta.url),'utf8');
  const expression=source.match(/const online=([^;]+);/)[1];
  const indicator=Function('data','isWorkerOnline','return '+expression);
  assert.equal(indicator(snapshot,cachedWorkerOnline),true);
  assert.equal(indicator({...snapshot,workerOnline:false},cachedWorkerOnline),false);
  assert.equal(indicator({worker},cachedWorkerOnline),false);
  assert.equal(indicator({worker:{running:true,at:49999}},cachedWorkerOnline),true);
 }
});
