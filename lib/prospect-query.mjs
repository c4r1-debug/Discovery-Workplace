import db from './db.mjs';
import {serviceOpportunity} from './opportunity.mjs';

db.function('within_radius',(lat,lng,centerLat,centerLng,radius)=>{
 if(lat===null||lng===null||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))return 0;
 const rad=n=>n*Math.PI/180,a=Math.sin(rad(lat-centerLat)/2)**2+Math.cos(rad(centerLat))*Math.cos(rad(lat))*Math.sin(rad(lng-centerLng)/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)))<=radius?1:0;
});
db.function('contains_text',(value,query)=>String(value).toLowerCase().includes(query)?1:0);
export function prospectFilter(input={}){
 const clauses=["r.kind='lead'"],args=[],field=k=>`json_extract(r.body,'$.${k}')`;
 const add=(sql,...values)=>{clauses.push(sql);args.push(...values);};
 if(input.q)add(`contains_text(coalesce(${field('name')},'')||' '||coalesce(${field('address')},'')||' '||coalesce(${field('owner')},'')||' '||coalesce(${field('email')},''),?)`,String(input.q).slice(0,200).toLowerCase());
 if(input.status&&input.status!=='All statuses')add(`${field('status')}=?`,String(input.status));
 if(input.hasEmail===true||input.hasEmail==='true')add(`coalesce(${field('email')},'')<>''`);
 for(const [key,column] of [['rating','rating'],['minReviews','reviews']])if(input[key]!==undefined&&input[key]!==''){
  const n=Number(input[key]);if(!Number.isFinite(n)||n<0)throw Error('Invalid prospect filter.');if(n)add(`coalesce(${field(column)},0)>=?`,n);
 }
 if(input.websiteFilter==='With website')add(`coalesce(${field('website')},'')<>''`);
 if(input.websiteFilter==='Without website')add(`coalesce(${field('website')},'')=''`);
 if(input.lat!==undefined&&input.lng!==undefined&&input.lat!==''&&input.lng!==''){
  const lat=Number(input.lat),lng=Number(input.lng),radius=Number(input.radius||50);
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180||!Number.isFinite(radius)||radius<=0)throw Error('Invalid radius filter.');
  add(`within_radius(${field('lat')},${field('lng')},?,?,?)=1`,lat,lng,radius);
 }
 if(input.jobId)add('EXISTS (SELECT 1 FROM job_leads jl WHERE jl.lead_id=r.id AND jl.job_id=?)',String(input.jobId));
 if(input.campaignIds){
  const ids=String(input.campaignIds).split(',').filter(Boolean);if(ids.length>500)throw Error('Too many selected searches.');
  if(ids.length)add(`EXISTS (SELECT 1 FROM job_leads jl JOIN jobs j ON j.id=jl.job_id WHERE jl.lead_id=r.id AND json_extract(j.body,'$.id') IN (${ids.map(()=>'?').join(',')}))`,...ids);
 }
 return {where:clauses.join(' AND '),args};
}
export function prospectIds(input){const {where,args}=prospectFilter(input);return db.prepare(`SELECT r.id FROM records r WHERE ${where} ORDER BY r.rowid DESC`).all(...args).map(r=>r.id);}
export function prospectSummary(lead){return {...Object.fromEntries(['id','name','category','address','owner','email','phone','website','rating','reviews','status','hot','lat','lng','mapsUrl'].map(k=>[k,lead[k]])),name:lead.name||'Unnamed prospect',opportunity:serviceOpportunity(lead)};}
export function prospectPage(input={}){
 const {where,args}=prospectFilter(input),total=db.prepare(`SELECT count(*) n FROM records r WHERE ${where}`).get(...args).n;
 const page=Math.max(1,Math.min(Math.ceil(total/50)||1,Math.floor(Number(input.page)||1)));
 const leads=db.prepare(`SELECT r.body FROM records r WHERE r.rowid IN (SELECT r.rowid FROM records r WHERE ${where} ORDER BY r.rowid DESC LIMIT 50 OFFSET ?) ORDER BY r.rowid DESC`).all(...args,(page-1)*50).map(r=>prospectSummary(JSON.parse(r.body)));
 return {leads,total,page,pages:Math.max(1,Math.ceil(total/50))};
}
export function prospectStats(){return db.prepare(`SELECT count(*) total,coalesce(sum(json_extract(body,'$.status')='Ready for review'),0) ready,coalesce(sum(json_extract(body,'$.hot')=1),0) hot,coalesce(sum(coalesce(json_extract(body,'$.clickupId'),'')<>''),0) sent FROM records WHERE kind='lead'`).get();}
