import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parse} from 'csv-parse/sync';

const testDir=mkdtempSync(path.join(tmpdir(),'discovery-industry-'));
process.env.DISCOVERY_DATA_DIR=testDir;
const {normalize,patchLead,importLeads}=await import('../lib/leads.mjs');
const {prospectsCSV}=await import('../lib/export.mjs');
const {prospectSummary,prospectPage}=await import('../lib/prospect-query.mjs');
const {default:db,get,put,list}=await import('../lib/db.mjs');
after(()=>{db.close();rmSync(testDir,{recursive:true,force:true});});

test('industry imports preserve Maps categories and explicit Industry corrections',()=>{
 assert.equal(normalize({name:'Unknown business'}).category,'');
 assert.equal(normalize({category:'  Marketing   agency\n '}).category,'Marketing agency');
 assert.equal(normalize({Industry:'Dentist',industry:'Restaurant',category:'Bank',Category:'Hotel'}).category,'Dentist');
 assert.equal(normalize({industry:'Restaurant',category:'Bank'}).category,'Restaurant');
 assert.equal(normalize({Category:'Hotel'}).category,'Hotel');
 assert.equal(normalize({Industry:'',category:'Dentist'}).category,'');
 assert.equal(normalize({Industry:'A'.repeat(130)}).category.length,120);
});

test('editing or clearing industry persists without changing contact research state',()=>{
 for(const manual of [undefined,false,true]){
  const lead=normalize({name:'Industry edit '+manual,category:'Dentist'});
  lead.status='Missing contact';
  if(manual!==undefined)lead.contactManual=manual;
  lead.contactCheckedAt='2026-10-01T00:00:00.000Z';
  put('lead',lead);
  const {category:oldCategory,...original}=get(lead.id,'lead');
  patchLead(lead.id,{category:'  Marketing   agency '});
  const {category:editedCategory,...edited}=get(lead.id,'lead');
  assert.equal(editedCategory,'Marketing agency');
  assert.deepEqual(edited,original);
  patchLead(lead.id,{category:''});
  const {category:clearedCategory,...cleared}=get(lead.id,'lead');
  assert.equal(clearedCategory,'');
  assert.deepEqual(cleared,original);
 }
});

test('prospect list summaries and pages expose the stored industry',()=>{
 const lead=put('lead',normalize({name:'Industry page fixture',category:'Restaurant'}));
 assert.equal(prospectSummary(lead).category,'Restaurant');
 const page=prospectPage({q:'Industry page fixture'});
 assert.equal(page.total,1);
 assert.equal(page.leads[0].category,'Restaurant');
});

test('both CSV formats include a uniform Industry column and import it back',()=>{
 for(const format of ['complete','gohighlevel']){
  const lead=normalize({name:'Industry roundtrip '+format,address:'10 Test Street',category:'Marketing agency'});
  const csv=prospectsCSV([lead],[],format);
  const [row]=parse(csv,{columns:true,bom:true});
  assert.equal(row.Industry,'Marketing agency');
  assert.equal(importLeads(csv).added,1);
  assert.equal(list('lead').find(l=>l.name===lead.name).category,'Marketing agency');
  const header=parse(prospectsCSV([],[],format),{bom:true})[0];
  assert.equal(header.filter(column=>column==='Industry').length,1);
  const [unknown]=parse(prospectsCSV([normalize({name:'Unknown'})],[],format),{columns:true,bom:true});
  assert.equal(unknown.Industry,'');
 }
});

test('duplicate imports preserve an industry that was manually corrected',()=>{
 const row={name:'Industry duplicate fixture',address:'20 Test Street',category:'Dentist'};
 assert.equal(importLeads(JSON.stringify([row])).added,1);
 const lead=list('lead').find(l=>l.name===row.name);
 patchLead(lead.id,{category:'Healthcare'});
 assert.equal(importLeads(JSON.stringify([row])).duplicates,1);
 assert.equal(get(lead.id,'lead').category,'Healthcare');
});
