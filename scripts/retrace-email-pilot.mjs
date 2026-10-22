import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import db,{dataDir,get} from '../lib/db.mjs';
import {collectEmails} from '../lib/email-collection.mjs';

// Run separately from the Maps worker; exclude its active prospects to avoid duplicate requests.
const rows=db.prepare(`SELECT r.body FROM records r WHERE r.kind='lead'
 AND coalesce(json_extract(r.body,'$.email'),'')=''
 AND coalesce(json_extract(r.body,'$.website'),'')<>''
 AND coalesce(json_extract(r.body,'$.contactManual'),0)=0
 AND json_extract(r.body,'$.websiteBlocked') IS NULL
 AND coalesce(json_extract(r.body,'$.status'),'') NOT IN ('Do not contact','Disqualified')
 AND json_extract(r.body,'$.emailCheckedAt') IS NULL
 AND r.id NOT IN (SELECT l.lead_id FROM job_leads l JOIN jobs j ON j.id=l.job_id WHERE j.status IN ('running','queued') AND j.type='discovery')
 ORDER BY json_extract(r.body,'$.createdAt'),r.rowid LIMIT 100`).all();
const selected=rows.map(r=>JSON.parse(r.body)),started=Date.now();
if(!selected.length){console.log('No unchecked eligible prospects remain.');db.close();process.exit(0);}
const dir=path.join(dataDir,'email-retraces',new Date(started).toISOString().replaceAll(':','-'));mkdirSync(dir,{recursive:true});
writeFileSync(path.join(dir,'selected.json'),JSON.stringify(selected.map(l=>({id:l.id,name:l.name,website:l.website,hadPhone:!!l.phone})),null,2));
const report=path.join(dir,'report.json');
function save(value){writeFileSync(report,JSON.stringify({startedAt:new Date(started).toISOString(),selected:selected.length,elapsedSeconds:Math.round((Date.now()-started)/1000),...value},null,2));}
console.log(JSON.stringify({event:'started',selected:selected.length,report}));
try{
 const result=await collectEmails(selected.map(l=>l.id),counts=>{save({status:'running',...counts});if(counts.checked%10===0)console.log(JSON.stringify({event:'progress',...counts,elapsedSeconds:Math.round((Date.now()-started)/1000)}));});
 const latest=selected.map(l=>get(l.id,'lead'));
 const summary={status:'completed',...result,emailsSaved:latest.filter(l=>l?.email).length,phonesAdded:latest.filter((l,i)=>!selected[i].phone&&l?.phone).length,failed:latest.filter(l=>l?.emailCollectionError).length,withoutEmail:latest.filter(l=>!l?.email&&!l?.emailCollectionError).length,finishedAt:new Date().toISOString()};
 save(summary);console.log(JSON.stringify({event:'completed',...summary,elapsedSeconds:Math.round((Date.now()-started)/1000),report}));
}catch(e){save({status:'failed',error:e.message});throw e;}finally{db.close();}
