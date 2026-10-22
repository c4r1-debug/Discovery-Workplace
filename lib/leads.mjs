import {linkLead} from './activity.mjs';
import {mapsDetails,blockedHost,websiteHost} from './maps-fallback.mjs';
import {parse} from 'csv-parse/sync';
import {addressFields} from './contact-format.mjs';
import {get,list,put} from './db.mjs';
export function webUrl(value){if(!value)return '';try{const u=new URL(value.includes('://')?value:'https://'+value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return '';return u.href;}catch{return '';}}
export function email(value){const s=String(value||'').trim();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&! /\.(?:webp|png|jpe?g|gif|svg|avif|ico|css|js|woff2?|ttf)$/i.test(s)?s:'';}
function coordinate(value,max){if(value===undefined||value===null||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&Math.abs(n)<=max?n:null;}
export function normalize(raw){raw={...raw,name:raw.title||raw.name||raw["Business Name"]||raw.Name,phone:raw.phone||raw.Phone||raw["Original Phone"],email:raw.email||raw.Email,website:raw.website||raw.Website,address:raw.address||raw["Full Address"]||[raw.Address,raw.City,raw.State,raw["Postal Code"],raw.Country].filter(Boolean).join(", "),streetAddress:raw.streetAddress||raw.Address,city:raw.city||raw.City,state:raw.state||raw.State,postalCode:raw.postalCode||raw["Postal Code"],country:raw.country||raw.Country};const emails=Array.isArray(raw.emails)?raw.emails:String(raw.emails||raw.email||'').split(/[;,\s]+/);return {id:crypto.randomUUID(),name:String(raw.title||raw.name||'').trim().slice(0,200),website:webUrl(raw.website||''),phone:String(raw.phone||''),email:emails.map(email).find(Boolean)||'',mapsData:mapsDetails(raw),owner:String(raw.Name||''),ownerSource:'',emailSource:raw.website||'',address:String(raw.address||''),category:String(raw.Industry??raw.industry??raw.category??raw.Category??'').trim().replace(/\s+/g,' ').slice(0,120),rating:Number(raw.review_rating||raw.rating)||0,reviews:Number(raw.review_count||raw.reviews)||0,lat:coordinate(raw.latitude??raw.lat,90),lng:coordinate(raw.longitude??raw.lng,180),placeId:String(raw.place_id||raw.placeId||'').trim(),mapsUrl:webUrl(raw.link||raw.mapsUrl||''),status:'New',hot:false,requested:false,notes:'',findings:[],score:null,createdAt:new Date().toISOString(),...addressFields(raw)};}
const identityText=value=>String(value||'').trim().toLowerCase();
export function dedupeKey(l){return l.placeId?'place:'+l.placeId:`business:${identityText(l.name)}:${identityText(l.address)}`;}
export function importLeads(text,limit=500,sourceJobId=null,options={}){
 const data=text.trim().startsWith('[')?JSON.parse(text):parse(text,{columns:true,skip_empty_lines:true,bom:true,relax_column_count:true});
 if(!Array.isArray(data))throw Error('Expected a CSV with headers or JSON array.');
 if(!sourceJobId&&data.length>10000)throw Error('Import at most 10,000 rows at once.');
 const index=options.index||new Map(list('lead').map(l=>[dedupeKey(l),l]));
 const byName=new Map();
 const remember=lead=>{const name=identityText(lead.name);if(!byName.has(name))byName.set(name,[]);byName.get(name).push(lead);};
 for(const lead of index.values())remember(lead);
 const blocked=new Set([...index.values()].map(blockedHost).filter(Boolean));
 let added=0,duplicates=0,consumed=0;const needsReview=[],addedIds=[],matchedIds=[];
 for(const row of data){
  if(limit!==null&&added>=limit)break;
  consumed++;const lead=normalize(row);if(!lead.name)continue;const key=dedupeKey(lead);
  const candidates=(byName.get(identityText(lead.name))||[]).filter(l=>!lead.placeId||!l.placeId);
  const exact=candidates.filter(l=>lead.address&&identityText(l.address)===identityText(lead.address));
  const existing=(lead.placeId?index.get(key):null)||(exact.length===1?exact[0]:null);
  if(existing){linkLead(sourceJobId,existing.id);matchedIds.push(existing.id);duplicates++;continue;}
  if(exact.length>1||candidates.some(l=>!lead.address||!l.address)){needsReview.push({row:consumed,name:lead.name,address:lead.address,candidateIds:candidates.map(l=>l.id)});continue;}
  lead.status=lead.email?'Ready for review':'Missing contact';lead.lastCollectedAt=new Date().toISOString();
  if(blocked.has(websiteHost(lead.website)))lead.websiteBlocked={host:websiteHost(lead.website),reason:'Previously blocked website',at:lead.lastCollectedAt};
  put('lead',lead);index.set(key,lead);remember(lead);linkLead(sourceJobId,lead.id);added++;addedIds.push(lead.id);
 }
 // Discovery handles email lookup separately; imports never enqueue full website audits.
 return {added,duplicates,...(needsReview.length?{needsReview}:{}),...(options.track?{consumed,addedIds,matchedIds}:{})};
}
export const statuses=['New','Missing contact','Ready for review','Contacted','Interested','Disqualified','Do not contact','Sent to ClickUp'];
export function sameWebsite(lead,snapshot){return !!lead&&!!snapshot&&lead.website===snapshot.website&&(lead.websiteRevision||'')===(snapshot.websiteRevision||'');}
export function patchLead(id,patch){
 const l=get(id,'lead');if(!l)throw Error('Lead not found.');
 if('category' in patch)l.category=String(patch.category??'').trim().replace(/\s+/g,' ').slice(0,120);
 if('website' in patch){
  const website=webUrl(patch.website);if(patch.website&&!website)throw Error('Enter a valid website URL.');
  if(website!==l.website){l.website=website;l.websiteRevision=crypto.randomUUID();l.findings=[];l.score=null;
   for(const key of ['websiteBlocked','ownerCandidates','checkedAt','draft','reportId'])delete l[key];
  }
 }
 let contactChanged=false;
 for(const k of ['owner','ownerSource','email','emailSource','notes'])if(k in patch){const value=String(patch[k]??'').slice(0,10000);if(k!=='notes'&&value!==(l[k]||''))contactChanged=true;l[k]=value;}
 if(patch.keepContactBlank===true){if(l.email)throw Error('Clear the email before keeping it blank.');contactChanged=true;}
 if(contactChanged){l.contactManual=true;l.contactCheckedAt=new Date().toISOString();l.contactType='Unconfirmed';}
 if(l.email&&!email(l.email))throw Error('Enter a valid email address.');
 for(const k of ['hot','requested'])if(k in patch)l[k]=!!patch[k];
 if(patch.status){if(!statuses.includes(patch.status))throw Error('Invalid status.');if(patch.status==='Sent to ClickUp'&&!l.clickupId)throw Error('Use the ClickUp handoff button.');l.status=patch.status;}
 return put('lead',l);
}

