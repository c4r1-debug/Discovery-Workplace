import db,{get,list,put} from './db.mjs';
export const mapsOnlyMessage='Website access blocked — using Google Maps details only. Research and audits are stopped.';
export function isAccessBlocked(error){return /HTTP\s*(401|403|429)\b/i.test(String(error?.message||error));}
export function websiteHost(url){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
export function blockedHost(lead){return lead?.websiteBlocked?(lead.websiteBlocked.host||websiteHost(lead.website)):'';}
export function websiteBlocked(lead){
 const host=websiteHost(lead?.website);if(!host)return false;if(blockedHost(lead)===host)return true;
 if(db.prepare("SELECT 1 FROM records WHERE kind='lead' AND json_extract(body,'$.websiteBlocked') IS NOT NULL AND json_extract(body,'$.websiteBlocked.host')=? LIMIT 1").get(host))return true;
 // Legacy flags without a host use the website; only those blocked records need loading.
 return db.prepare("SELECT json_extract(body,'$.website') AS website,json_extract(body,'$.websiteBlocked') AS flag FROM records WHERE kind='lead' AND json_extract(body,'$.websiteBlocked') IS NOT NULL AND json_extract(body,'$.websiteBlocked.host') IS NULL").all().some(row=>row.flag&&websiteHost(row.website)===host);
}
export function stopWebsiteWork(id,reason,target){
  const lead=get(id,'lead');if(!lead)return;
  if(target&&(lead.website!==target.website||(lead.websiteRevision||'')!==(target.websiteRevision||'')))return;
  const host=websiteHost(lead.website);if(!host)return;
  for(const l of list('lead'))if(websiteHost(l.website)===host){
    l.websiteBlocked={host,reason:String(reason),at:new Date().toISOString()};l.score=null;put('lead',l);
    db.prepare("UPDATE jobs SET status='skipped',error=?,updated=? WHERE type IN ('research','audit') AND status='queued' AND json_extract(body,'$.leadId')=?").run(mapsOnlyMessage,new Date().toISOString(),l.id);
  }
}
export function mapsDetails(raw){const fields=['open_hours','descriptions','about','reviews_per_rating','user_reviews','user_reviews_extended','reviews_link','price_range','plus_code','status'];const data={};for(const key of fields){let value=raw[key];if(value===undefined||value===null||value==='')continue;if(typeof value==='string'){try{value=JSON.parse(value);}catch{}}data[key]=value;}return data;}
export function compactJobs(rows){const seen=new Set();return rows.filter(j=>{if(!j.body?.leadId||!['research','audit'].includes(j.type)||!(j.status==='skipped'||isAccessBlocked(j.error)))return true;const key=j.body.leadId;if(seen.has(key))return false;seen.add(key);return true;}).map(j=>isAccessBlocked(j.error)?{...j,status:'skipped',error:mapsOnlyMessage}:j);}
