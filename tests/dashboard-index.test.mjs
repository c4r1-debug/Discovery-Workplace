import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const testDir=mkdtempSync(path.join(tmpdir(),'discovery-dashboard-index-'));
process.env.DISCOVERY_DATA_DIR=testDir;
const {default:db,put}=await import('../lib/db.mjs');
const {prospectStats,prospectFilter,prospectPage}=await import('../lib/prospect-query.mjs');
after(()=>{db.close();rmSync(testDir,{recursive:true,force:true});});

test('dashboard counts remain current after prospect inserts, edits and deletes',()=>{
 put('lead',{id:'ready',status:'Ready for review',hot:false});
 put('lead',{id:'hot',status:'Missing contact',hot:true,clickupId:'task-one'});
 put('lead',{id:'legacy',name:'Legacy prospect'});
 put('campaign',{id:'search',status:'Ready for review',hot:true,clickupId:'not-a-contact'});
 assert.deepEqual({...prospectStats()},{total:3,ready:1,hot:1,sent:1});
 put('lead',{id:'hot',status:'Ready for review',hot:false,clickupId:''});
 assert.deepEqual({...prospectStats()},{total:3,ready:2,hot:0,sent:0});
 db.prepare("DELETE FROM records WHERE id=? AND kind='lead'").run('ready');
 assert.deepEqual({...prospectStats()},{total:2,ready:1,hot:0,sent:0});
});

test('dashboard statistics and plain prospect counts use the covering index',()=>{
 const statistics="SELECT count(*) total,coalesce(sum(json_extract(body,'$.status')='Ready for review'),0) ready,coalesce(sum(json_extract(body,'$.hot')=1),0) hot,coalesce(sum(coalesce(json_extract(body,'$.clickupId'),'')<>''),0) sent FROM records WHERE kind='lead'";
 for(const sql of [statistics,"SELECT count(*) n FROM records WHERE kind='lead'"]){
  const plan=db.prepare('EXPLAIN QUERY PLAN '+sql).all().map(row=>row.detail).join(' ');
  assert.match(plan,/USING COVERING INDEX records_dashboard/);
  assert.doesNotMatch(plan,/SCAN records/);
 }
});

test('search and contact, rating and radius filters stay correct using the covering index',()=>{
 const lead={id:'near-clinic',name:'North Shore Dental',owner:'Pat Example',email:'office@clinic.test',address:'10 Example Street',status:'Ready for review',rating:4.5,reviews:20,website:'https://clinic.test',lat:40,lng:-74};
 put('lead',lead);
 put('lead',{...lead,id:'far-clinic',lat:41});
 put('report',{...lead,id:'report-not-prospect'});
 const input={q:'SHORE',status:'Ready for review',hasEmail:true,rating:4,minReviews:10,websiteFilter:'With website',lat:40,lng:-74,radius:2};
 assert.equal(prospectPage(input).total,1);
 assert.equal(prospectPage(input).leads[0].id,'near-clinic');
 assert.equal(prospectPage({q:'OFFICE@CLINIC.TEST'}).total,2);
 put('lead',{...lead,email:'',reviews:2});
 assert.equal(prospectPage(input).total,0);
 for(const filter of [{q:'Shore'},input]){
  const {where,args}=prospectFilter(filter);
  const plan=db.prepare('EXPLAIN QUERY PLAN SELECT count(*) n FROM records r WHERE '+where).all(...args).map(row=>row.detail).join(' ');
  assert.match(plan,/USING COVERING INDEX records_dashboard/);
 }
});

test('paged prospect bodies retain insertion order and bounded summaries',()=>{
 const ids=[];
 for(let i=0;i<125;i++){
  const id='page-order-'+i;ids.push(id);
  put('lead',{id,name:'Page order marker '+i,category:'Healthcare',notes:'x'.repeat(5000)});
 }
 const newest=[...ids].reverse();
 for(const requested of [1,3,99]){
  const result=prospectPage({q:'Page order marker',page:requested});
  const page=Math.min(requested,3);
  assert.equal(result.total,125);
  assert.equal(result.page,page);
  assert.deepEqual(result.leads.map(lead=>lead.id),newest.slice((page-1)*50,page*50));
  assert.ok(result.leads.every(lead=>lead.category==='Healthcare'&&!('notes' in lead)));
 }
});
