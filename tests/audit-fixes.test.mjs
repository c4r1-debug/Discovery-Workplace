import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-fixes-'));
const {default:db,get,put,list,setConfig,saveSecret,enqueue,jobs}=await import('../lib/db.mjs');
const {normalize,patchLead,importLeads}=await import('../lib/leads.mjs');
const {applyResearch,saveReport,updateWorkflow,criteria}=await import('../lib/workflow.mjs');
const {prospectsCSV}=await import('../lib/export.mjs');
const {sendClickup}=await import('../lib/integrations.mjs');
const {register}=await import('../lib/accounts.mjs');
const {login}=await import('../lib/auth.mjs');
const {regionDirectory,selectedRegionAreas}=await import('../lib/locations.mjs');
const {runDiscovery}=await import('../lib/discovery-run.mjs');
const {prospectPage,prospectIds}=await import('../lib/prospect-query.mjs');
// Load the actual route, adjusting only Next's extension for native Node ESM.
const routeFile=fileURLToPath(new URL('../app/api/workspace/route.js',import.meta.url));
const routeSource=readFileSync(routeFile,'utf8').replace(/from '([^']+)'/g,(full,specifier)=>{
 if(specifier.startsWith('.'))return `from '${pathToFileURL(path.resolve(path.dirname(routeFile),specifier)).href}'`;
 if(specifier==='next/server')return `from '${new URL('../node_modules/next/server.js',import.meta.url).href}'`;
 return full;
});
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(routeSource).toString('base64'));
const {NextRequest}=await import('../node_modules/next/server.js');
register('owner','fixture-owner-password');register('member','fixture-member-password');
const cookie='discovery_session='+login('member','fixture-member-password');
function request(body,query=''){return new NextRequest('http://127.0.0.1:3999/api/workspace'+query,{method:body?'POST':'GET',headers:{host:'127.0.0.1:3999',origin:'http://127.0.0.1:3999',cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}

test('member actions cannot mutate reports or replace prospects with campaigns',async()=>{
 const report={id:crypto.randomUUID(),kind:'report',shareToken:'approved-link',website:'https://example.com/'};put('report',report);
 assert.equal((await POST(request({action:'lead',id:report.id,patch:{website:'https://changed.example'}}))).status,400);
 assert.equal((await POST(request({action:'workflow',id:report.id,patch:{service:'Changed'}}))).status,400);
 assert.deepEqual(get(report.id),report);
 const lead=normalize({name:'Protected prospect',address:'One Street'});put('lead',lead);
 assert.equal((await POST(request({action:'campaign',campaign:{id:lead.id,keyword:'Test',location:'Test',enabled:false,batch:1}}))).status,400);
 assert.deepEqual(get(lead.id),lead);assert.throws(()=>put('campaign',{id:lead.id}),/type/);
});

test('complete CSV and missing-ID duplicates preserve opt-outs; ambiguous matches are held',()=>{
 const lead=normalize({name:'Roundtrip',address:'One Street',place_id:'roundtrip-id'});lead.status='Do not contact';put('lead',lead);
 assert.deepEqual(importLeads(prospectsCSV([lead],[],'complete')),{added:0,duplicates:1});
 assert.deepEqual(importLeads(JSON.stringify([{name:lead.name,address:lead.address} ])),{added:0,duplicates:1});
 const held=importLeads(JSON.stringify([{name:lead.name}]));assert.equal(held.added,0);assert.equal(held.needsReview.length,1);
 assert.equal(importLeads(JSON.stringify([{name:lead.name,address:'Different branch address'}])).added,1);
 assert.equal(get(lead.id).status,'Do not contact');
});

test('unrelated saves keep contact provenance; changed websites reject stale research and reports',()=>{
 const lead=normalize({name:'Contact test',website:'https://old.example'});put('lead',lead);
 patchLead(lead.id,{notes:'New note',email:'',owner:'',ownerSource:'',emailSource:lead.emailSource});
 updateWorkflow(lead.id,{contactType:'Unconfirmed',service:'Website'},'member');
 assert.equal(get(lead.id).contactManual,undefined);
 const result={findings:[],score:0,ownerCandidates:[],checkedAt:new Date().toISOString(),emails:['office@example.com'],emailSource:lead.website};
 put('lead',applyResearch(get(lead.id),result,lead));assert.equal(get(lead.id).email,'office@example.com');
 const snapshot={...get(lead.id),hot:true,websiteBlocked:{host:'old.example'},draft:'Old draft',reportId:'old-report'};put('lead',snapshot);
 const changed=patchLead(lead.id,{website:'https://new.example'});
 for(const key of ['websiteBlocked','draft','reportId'])assert.equal(changed[key],undefined);
 assert.deepEqual(changed.findings,[]);assert.throws(()=>applyResearch(changed,result,snapshot),/changed/);
 const report={id:crypto.randomUUID(),kind:'report',leadId:lead.id,website:snapshot.website};
 assert.throws(()=>saveReport(snapshot,report),/changed/);assert.ok(get(report.id,'report'));assert.equal(get(lead.id).reportId,undefined);
 patchLead(lead.id,{email:''});assert.equal(get(lead.id).contactManual,true);
});

test('async draft and rejected ClickUp response preserve concurrent opt-out and notes',async()=>{
 const lead=normalize({name:'Concurrent edits',website:'https://example.com',email:'office@example.com'});lead.findings=[{title:'Booking',status:'review'}];lead.status='Interested';lead.qualification=Object.fromEntries(criteria().map(c=>[c,true]));put('lead',lead);
 setConfig('settings',{aiEnabled:true,aiProvider:'gemini',aiModel:'fixture-model',clickupList:'fixture-list'});saveSecret('ai','fixture-key');saveSecret('clickup','fixture-token');
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{patchLead(lead.id,{status:'Do not contact',notes:'Do not overwrite'});return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Stale draft'}]}}]}));};
  assert.equal((await POST(request({action:'draft',id:lead.id}))).status,400);assert.equal(get(lead.id).draft,undefined);assert.equal(get(lead.id).notes,'Do not overwrite');
  patchLead(lead.id,{status:'Interested'});
  globalThis.fetch=async()=>{patchLead(lead.id,{status:'Do not contact',notes:'Latest ClickUp note'});return new Response('Rejected',{status:400});};
  await assert.rejects(sendClickup(lead.id),/HTTP 400/);assert.equal(get(lead.id).status,'Do not contact');assert.equal(get(lead.id).notes,'Latest ClickUp note');assert.equal(get(lead.id).clickupPending,false);
 }finally{globalThis.fetch=original;}
});

test('pagination bounds summaries while filters and bulk selection include later pages',async()=>{
 const campaignId='paging-campaign',jobId=enqueue('discovery',{id:campaignId});
 for(let i=0;i<125;i++){const lead=normalize({name:'Paging '+i,address:'Test',place_id:'paging-'+i,email:'office@example.com',lat:40,lng:-74});lead.rating=4.5;lead.reviews=20;lead.notes='x'.repeat(20000);put('lead',lead);db.prepare('INSERT INTO job_leads VALUES(?,?,0)').run(jobId,lead.id);}
 const filter={q:'Paging',rating:4,minReviews:10,hasEmail:true,lat:40,lng:-74,radius:2};
 assert.equal(prospectPage(filter).leads.length,50);assert.equal(prospectPage({...filter,page:3}).leads.length,25);assert.equal(prospectIds(filter).length,125);
 assert.equal(prospectPage({jobId}).total,125);assert.equal(prospectPage({campaignIds:campaignId}).total,125);
 const response=await GET(request(null,'?q=Paging&page=3'));const body=await response.json();assert.equal(response.status,200);assert.equal(body.leads.length,25);assert.equal(body.prospectPage.total,125);assert.ok(body.leads.every(l=>!('notes' in l)));assert.ok(JSON.stringify(body).length<50000);
});

test('region IDs, manual towns and recent-area skips retain progress without empty-run stops',async()=>{
 const directory=regionDirectory('Alaska, United States');assert.equal(directory.areas.length,5);assert.equal(new Set(directory.areas.map(a=>a.id)).size,5);
 const selected=selectedRegionAreas(directory.region.id,[directory.areas[0].id],'Small town');assert.equal(selected.areas.length,2);assert.match(selected.areas[1].label,/Small town, Alaska, United States/);assert.throws(()=>selectedRegionAreas(directory.region.id,['unknown']),/valid areas/);
 setConfig('settings',{gosomMode:'docker'});
 const c={id:crypto.randomUUID(),keyword:'Test',location:'Recent area',batch:10,enabled:true,emptyStop:3};put('campaign',c);
 const first=enqueue('discovery',c);await runDiscovery(jobs().find(j=>j.id===first),async(binary,args,timeout,log)=>writeFileSync(path.join(path.dirname(log),'results.csv'),'title,place_id\nRecent prospect,recent-one\n'));
 for(let i=0;i<4;i++){const id=enqueue('discovery',get(c.id));await runDiscovery(jobs().find(j=>j.id===id),async()=>assert.fail('Recent area must be skipped'));assert.equal(jobs().find(j=>j.id===id).body.result.skipped,true);}
 assert.equal(get(c.id).enabled,true);assert.equal(get(c.id).emptyRuns,0);assert.ok(Date.parse(get(c.id).nextEligibleAt)>Date.now());
 const migrated={id:crypto.randomUUID(),keyword:'Test',location:directory.region.label,scope:'region',batch:10,areas:[directory.areas[0]],areaState:[{location:directory.areas[0].label,status:'completed',finishedAt:new Date().toISOString()}]};put('campaign',migrated);
 const id=enqueue('discovery',migrated);await runDiscovery(jobs().find(j=>j.id===id),async()=>assert.fail('Legacy progress must migrate'));
 assert.equal(get(migrated.id).areaState[0].id,directory.areas[0].id);
 const ambiguous={...migrated,id:crypto.randomUUID(),areas:[directory.areas[0],{id:'another-city',label:directory.areas[0].label}]};put('campaign',ambiguous);
 const ambiguousId=enqueue('discovery',ambiguous);await assert.rejects(runDiscovery(jobs().find(j=>j.id===ambiguousId),async()=>assert.fail('Ambiguous legacy progress cannot be reused')),/ambiguous/);
});
