import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const dir=mkdtempSync(path.join(tmpdir(),'discovery-verification-'));process.env.DISCOVERY_DATA_DIR=dir;
const {put,enqueue}=await import('../lib/db.mjs');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3101'],{env:process.env,stdio:['ignore','pipe','pipe'],windowsHide:true});
server.stdout.on('data',()=>{});server.stderr.on('data',d=>process.stderr.write(d));
const base='http://127.0.0.1:3101';let cookie='';
async function api(body,expected=200){const r=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return data;}
async function state(params={}){return (await fetch(base+'/api/workspace?'+new URLSearchParams(params),{headers:{Cookie:cookie}})).json();}
try{for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}
assert.equal((await state()).setup,true);await api({action:'import',text:'title\nUnauthorized'},401);
const created=await api({action:'register',name:'owner',password:'verification-owner-only'});assert.ok(created.recoveryCode);await api({action:'register',name:'researcher',password:'verification-member-only'});
await api({action:'login',name:'owner',password:'wrong'},400);await api({action:'login',name:'owner',password:'verification-owner-only'});
assert.deepEqual(await api({action:'import',text:'title,address,website,emails,review_rating,review_count,latitude,longitude\nExample Practice (test only),Test Location,https://example.com,contact@example.com,4.8,125,40.05,-74.4'}),{added:1,duplicates:0});
let s=await state(),lead=s.leads[0];assert.equal(s.user,'owner');await api({action:'audit',id:lead.id},400);await api({action:'lead',id:lead.id,patch:{hot:true,notes:'Synthetic verification record. Not a real lead.'}});await api({action:'audit',id:lead.id});await api({action:'audit',id:lead.id},400);
const report={id:crypto.randomUUID(),kind:'report',leadId:lead.id,business:'Synthetic test report',website:'https://example.com',createdAt:new Date().toISOString(),findings:[],mobile:{categories:[],metrics:[],findings:[]},desktop:{categories:[],metrics:[],findings:[]}};put('report',report);
const seededPreview={id:crypto.randomUUID(),key:'verification-preview',leads:[lead]};put('preview',seededPreview);
async function viewState(view,extra={}){const response=await fetch(base+'/api/workspace?'+new URLSearchParams({view,...extra}),{headers:{Cookie:cookie}});assert.equal(response.status,200);return response.json();}
const discover=await viewState('discover');assert.equal(discover.stats.total,1);for(const key of ['leads','jobs','previews','reports','campaigns','backups'])assert.equal(discover[key].length,0,key);
const prospects=await viewState('prospects');assert.equal(prospects.leads[0].id,lead.id);assert.equal(prospects.prospectPage.total,1);assert.equal(prospects.jobs.length,0);assert.equal(prospects.previews.length,0);
assert.equal((await viewState('discover',{previewKey:seededPreview.key})).previews[0].id,seededPreview.id);
assert.equal((await viewState('reports')).reports[0].id,report.id);assert.equal((await viewState('settings')).jobs.length,1);assert.equal((await viewState('schedule')).jobs[0].leadName,lead.name);
assert.equal((await viewState('prospects',{leadId:lead.id})).selectedLead.id,lead.id);
assert.deepEqual((await fetch(base+'/api/workspace?ids=true',{headers:{Cookie:cookie}}).then(r=>r.json())).ids,[lead.id]);
assert.equal((await fetch(base+'/report/'+report.id)).status,404);
assert.equal((await fetch(base+'/report/'+report.id+'/download')).status,404);
const draftDownload=await fetch(base+'/report/'+report.id+'/download',{headers:{Cookie:cookie}});assert.equal(draftDownload.status,200);assert.match(draftDownload.headers.get('content-type'),/wordprocessingml/);assert.equal(Buffer.from(await draftDownload.arrayBuffer()).subarray(0,2).toString(),'PK');
await api({action:'share',id:report.id,approve:true});s=await state();const token=s.reports[0].shareToken;assert.equal((await fetch(base+'/report/'+token)).status,200);
assert.equal((await fetch(base+'/report/'+token+'/download')).status,200);
await api({action:'share',id:report.id,approve:false});assert.equal((await fetch(base+'/report/'+token)).status,404);
assert.equal((await fetch(base+'/report/'+token+'/download')).status,404);
await api({action:'logout'});await api({action:'login',name:'researcher',password:'verification-member-only'});await api({action:'share',id:report.id,approve:true},400);
await api({action:'clickup',id:lead.id},400);await api({action:'settings',settings:{agency:'Test workspace',aiEnabled:false,gosomMode:'docker'},secrets:{ai:'verification-secret-not-real'}});s=await state();assert.equal(s.credentials.ai,true);assert.equal(JSON.stringify(s).includes('verification-secret-not-real'),false);
const forbidden=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example',Cookie:cookie},body:JSON.stringify({action:'logout'})});assert.equal(forbidden.status,403);
await api({action:'campaign',campaign:{keyword:'Dentist',location:'New Jersey, USA',batch:50,enabled:true}});s=await state();await api({action:'toggleCampaign',id:s.campaigns[0].id,enabled:false});assert.equal((await state()).campaigns[0].enabled,false);
assert.equal((await viewState('schedule')).campaigns[0].id,s.campaigns[0].id);assert.equal((await viewState('territories')).campaigns[0].id,s.campaigns[0].id);
const loc=await fetch(base+'/api/locations?q=New%20Jersey',{headers:{Cookie:cookie}});assert.equal(loc.status,200);assert.ok((await loc.json()).some(l=>l.type==='Region'));
const exported=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:JSON.stringify({action:'export',ids:[lead.id]})});assert.equal(exported.status,200);assert.ok(exported.headers.get('content-type').includes('text/csv'));assert.ok((await exported.text()).includes('Example Practice'));
const compactExport=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:JSON.stringify({action:'export',format:'gohighlevel',ids:[lead.id]})});assert.equal(compactExport.status,200);const compactText=await compactExport.text();assert.match(compactText,/"Postal Code"/);assert.match(compactText,/"Opportunity Level"/);assert.equal(compactText.includes('"mapsData"'),false);assert.equal(compactText.includes('"reports"'),false);
await api({action:'export',format:'invalid'},400);
const unlimited=await api({action:'campaign',campaign:{keyword:'Dentist',location:'Test city',batch:'',enabled:false}});assert.equal(unlimited.batch,null);
const automation={keyword:'Dentist',location:'Test city',batch:25,enabled:true,schedule:{timezone:'America/New_York',startLocal:'2026-09-21T09:00',every:2,unit:'hours',days:[1,2,3,4,5],from:'09:00',to:'17:00'}};
const scheduled=await api({action:'campaign',campaign:automation});assert.equal(scheduled.nextRun,'2026-09-21T13:00:00.000Z');assert.equal(scheduled.schedule.every,2);
const updatedSchedule=await api({action:'campaign',campaign:{...automation,id:scheduled.id,target:100,emptyStop:2}});assert.equal(updatedSchedule.target,100);assert.equal(updatedSchedule.emptyStop,2);assert.equal((await state()).campaigns.find(c=>c.id===scheduled.id).upcoming.length,5);
await api({action:'workflow',id:lead.id,patch:{assignedTo:'researcher',contactType:'Practice inbox',service:'Website redesign',nextAction:'Discovery call',qualification:Object.fromEntries((await state()).criteria.map(c=>[c,true]))}});
await api({action:'lead',id:lead.id,patch:{status:'Interested'}});
const handoff=await api({action:'handoffPreview',id:lead.id});assert.ok(handoff.token);assert.match(handoff.description,/Website redesign/);assert.ok(handoff.qualification.ready);
await api({action:'clickup',id:lead.id,previewToken:'stale'},400);
assert.ok((await state({leadId:lead.id})).events.some(e=>e.leadId===lead.id));
await api({action:'backup'},400);
await api({action:'campaign',campaign:{...automation,batch:0}},400);
await api({action:'campaign',campaign:{...automation,schedule:{...automation.schedule,days:[]}}},400);
const preview=await api({action:'preview',keyword:'Dentist',location:'Test city'});const duplicatePreview=await api({action:'preview',keyword:'Dentist',location:'Test city'});assert.equal(preview.id,duplicatePreview.id);
const recovery=await api({action:'renewRecovery',password:'verification-member-only'});assert.ok(recovery.recoveryCode);
await api({action:'resetPassword',name:'researcher',code:'invalid',password:'replacement-password-123'},400);
const reset=await api({action:'resetPassword',name:'researcher',code:recovery.recoveryCode,password:'replacement-password-123'});assert.ok(reset.recoveryCode);assert.equal((await state()).user,null);
await api({action:'resetPassword',name:'researcher',code:recovery.recoveryCode,password:'another-password-123'},400);
await api({action:'login',name:'researcher',password:'verification-member-only'},400);
await api({action:'login',name:'RESEARCHER',password:'replacement-password-123'});assert.equal((await state()).role,'member');
console.log('PASS: HTTP registration, authentication, recovery rotation/session revocation, imports, audit gating, duplicate jobs, report approval/revocation, administrator permissions, secret redaction, CSRF and scheduling.');
if(process.argv.includes('--keep')){console.log('TEST_SERVER_READY at '+base);console.log('Test data folder: '+dir);console.log('Test-only logins: owner / verification-owner-only, researcher / verification-member-only');await new Promise(()=>{});}
}finally{server.kill();}

