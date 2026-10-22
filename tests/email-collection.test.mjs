import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-emails-'));
const {pageEmails,pagePhones,findPublishedEmail,collectEmails}=await import('../lib/email-collection.mjs');
const {put,get,setConfig,enqueue,jobs}=await import('../lib/db.mjs');
const {runDiscovery}=await import('../lib/discovery-run.mjs');
const {applyResearch}=await import('../lib/workflow.mjs');
test('published emails include encoded mailto links and ignore scripts and assets',()=>{
 assert.deepEqual(pageEmails('<script>fake@example.com</script><p>photo@2x.png</p><a href="mailto:hello&#64;example.com">Email</a>'),['hello@example.com']);
});
test('homepage email ends lookup and phone is collected without extra requests',async()=>{
 const visited=[];
 const result=await findPublishedEmail('https://example.com',async url=>{
  visited.push(url);return {url,status:200,text:'<p>office@example.com</p><a href="/contact">Contact</a><a href="tel:%2B12025550143">Call</a>'};
 });
 assert.deepEqual(visited,['https://example.com']);assert.deepEqual(result.emails,['office@example.com']);assert.equal(result.emailSource,'https://example.com');assert.deepEqual(result.phones,['+12025550143']);assert.equal(result.phoneSource,'https://example.com');
});

test('linked Contact page takes priority over About and retains email and phone sources',async()=>{
 const visited=[];
 const result=await findPublishedEmail('https://example.com/',async url=>{
  visited.push(url);return {url,status:200,text:url==='https://example.com/'?'<a href="/about">About</a><a href="/get-in-touch">Contact us</a>':'<a href="mailto:office%40example.com">Email</a><p>020 7946 0018</p>'};
 },null,'GB');
 assert.deepEqual(visited,['https://example.com/','https://example.com/get-in-touch']);assert.deepEqual(result.emails,['office@example.com']);assert.equal(result.emailSource,'https://example.com/get-in-touch');assert.deepEqual(result.phones,['+442079460018']);assert.equal(result.phoneSource,'https://example.com/get-in-touch');
});

test('a usable Contact page without email ends lookup and retains its phone',async()=>{
 const visited=[];
 const result=await findPublishedEmail('https://example.com/',async url=>{
  visited.push(url);return {url,status:200,text:url==='https://example.com/'?'<a href="/contact">Contact</a><a href="/team">Team</a>':'<a href="/contact/team">Contact our staff</a><a href="tel:+12025550143">Call</a>'};
 });
 assert.deepEqual(visited,['https://example.com/','https://example.com/contact']);assert.deepEqual(result.emails,[]);assert.deepEqual(result.phones,['+12025550143']);assert.equal(result.phoneSource,'https://example.com/contact');
});

test('missing Contact route tries Contact-us fallback and ignores failed-page emails',async()=>{
 const visited=[];
 const result=await findPublishedEmail('https://example.com/',async url=>{
  visited.push(url);return {url,status:url.endsWith('/contact')?404:200,text:url.endsWith('/contact')?'wrong@example.com':url.endsWith('/contact-us')?'office@example.com':''};
 });
 assert.deepEqual(visited,['https://example.com/','https://example.com/contact','https://example.com/contact-us']);assert.deepEqual(result.emails,['office@example.com']);assert.equal(result.emailSource,'https://example.com/contact-us');
});

test('invalid and external Contact links and redirects cannot supply contacts',async()=>{
 const visited=[];
 const result=await findPublishedEmail('https://example.com/',async url=>{
  visited.push(url);
  if(url==='https://example.com/')return {url,status:200,text:'<a href="https://external.example/contact">Contact</a><a href="javascript:contact()">Contact</a><a href="http://[">Contact</a><a href="#contact">Contact</a><a href="/contact-details">Contact</a>'};
  if(url.endsWith('/contact-details'))return {url:'https://external.example/contact',status:200,text:'wrong@external.example <a href="tel:+12025550143">Call</a>'};
  return {url,status:200,text:'office@example.com'};
 });
 assert.deepEqual(visited,['https://example.com/','https://example.com/contact-details','https://example.com/contact']);assert.deepEqual(result.emails,['office@example.com']);assert.deepEqual(result.phones,[]);assert.equal(result.emailSource,'https://example.com/contact');
});

test('phone extraction uses the known country, ignores scripts, and preserves extensions',()=>{
 assert.deepEqual(pagePhones('<script>+1 202 555 0143</script><style>020 7946 0018</style><p>020 7946 0018</p>'),[]);
 assert.deepEqual(pagePhones('<p>020 7946 0018</p>','GB'),['+442079460018']);
 assert.deepEqual(pagePhones('<a href="tel:%2B12025550143;ext=123">Call</a><p>+1 202 555 0143 ext. 123</p>','US'),['+12025550143 ext. 123']);
 assert.deepEqual(pagePhones('<a href="tel:123">Call</a><p>Invoice 12345</p>','US'),[]);
});
test('email collection skips protected contacts and preserves saved and concurrent phone edits',async()=>{
 for(const [id,extra] of [['fresh',{}],['manual',{contactManual:true}],['excluded',{status:'Do not contact'}],['saved',{email:'saved@example.com'}],['edited',{}],['maps-phone',{phone:'+442079460018'}],['phone-edited',{}],['website-edited',{}]])put('lead',{id,website:'https://'+id+'.example',country:'GB',email:'',status:'Missing contact',...extra});
 let calls=0;
 await collectEmails(['fresh','manual','excluded','saved','edited','maps-phone','phone-edited','website-edited'],()=>{},async(website,_fetch,_page,country)=>{
  calls++;assert.equal(country,'GB');const id=new URL(website).hostname.split('.')[0];
  if(id==='edited'){const lead=get(id);lead.contactManual=true;put('lead',lead);}
  if(id==='phone-edited'){const lead=get(id);lead.phone='+442079460019';put('lead',lead);}
  if(id==='website-edited'){const lead=get(id);lead.website='https://changed.example';put('lead',lead);}
  return {emails:['office@example.com'],emailSource:website+'/contact',phones:['+12025550143'],phoneSource:website+'/contact'};
 });
 assert.equal(calls,5);assert.equal(get('fresh').email,'office@example.com');assert.equal(get('fresh').status,'Ready for review');assert.equal(get('fresh').phone,'+12025550143');assert.equal(get('fresh').phoneSource,'https://fresh.example/contact');assert.equal(get('manual').email,'');assert.equal(get('manual').phone,undefined);assert.equal(get('excluded').email,'');assert.equal(get('saved').email,'saved@example.com');assert.equal(get('edited').email,'');assert.equal(get('edited').phone,undefined);assert.equal(get('maps-phone').phone,'+442079460018');assert.equal(get('phone-edited').phone,'+442079460019');assert.equal(get('website-edited').email,'');assert.equal(get('website-edited').phone,undefined);
});
test('manual website research fills a missing phone and preserves saved and manual contacts',()=>{
 const result={findings:[],score:0,ownerCandidates:[],checkedAt:new Date().toISOString(),emails:['office@example.com'],emailSource:'https://example.com/contact',phones:['+12025550143'],phoneSource:'https://example.com/contact'};
 const lead={website:'https://example.com',email:'',phone:'',status:'Missing contact'};
 const fresh=applyResearch({...lead},result);assert.equal(fresh.phone,'+12025550143');assert.equal(fresh.phoneSource,result.phoneSource);assert.equal(fresh.email,'office@example.com');assert.equal(fresh.status,'Ready for review');
 const saved=applyResearch({...lead,email:'saved@example.com',phone:'+442079460018'},result);assert.equal(saved.email,'saved@example.com');assert.equal(saved.phone,'+442079460018');
 const manual=applyResearch({...lead,contactManual:true},result);assert.equal(manual.email,'');assert.equal(manual.phone,'');
});
test('new and duplicate prospects receive emails while Maps is running, and resume keeps completed checks',async()=>{
 setConfig('settings',{gosomMode:'docker'});
 put('lead',{id:'existing-stream',name:'Existing',placeId:'existing-stream',website:'https://example.com',email:'',status:'Missing contact'});
 const id=enqueue('discovery',{keyword:'Business',location:'Test',batch:2,findEmails:true});
 let scraping=false,lookups=0;
 const lookup=(ids,callback)=>collectEmails(ids,callback,async()=>{assert.equal(scraping,true);lookups++;return {emails:['office@example.com'],emailSource:'https://example.com/contact'};});
 await runDiscovery(jobs().find(j=>j.id===id),async(_binary,_args,_timeout,log,controls)=>{
  scraping=true;writeFileSync(path.join(path.dirname(log),'results.csv'),'title,place_id,website\nExisting,existing-stream,https://example.com\nNew,new-stream,https://example.com\n');controls.poll();
  await new Promise(r=>setTimeout(r,10));assert.equal(get('existing-stream').email,'office@example.com');assert.equal(lookups,2);scraping=false;
 },lookup);
 const completed=jobs().find(j=>j.id===id);assert.equal(completed.body.result.emailsFound,2);assert.equal(completed.body.result.emailDoneIds.length,2);
 await runDiscovery({...completed,body:{...completed.body,resume:true}},async()=>assert.fail('Completed Maps results should be reused'),lookup);
 assert.equal(lookups,2);
});
