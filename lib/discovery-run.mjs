import {collectEmails} from './email-collection.mjs';
import {progress,finishCampaign} from './progress.mjs';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {parse} from 'csv-parse/sync';
import db,{dataDir,settings,list,get,put,setConfig} from './db.mjs';
import {validateScraper} from './scraper.mjs';
import {normalize,importLeads,dedupeKey} from './leads.mjs';
import {areaIdentity} from './locations.mjs';
import {nextAllowed} from './schedule.mjs';
export function scraperArgs(query,output,depth,concurrency=1){return ['-input',query,'-results',output,'-depth',String(depth),'-c',String(concurrency),'-exit-on-inactivity','0'];}
export function csvSnapshot(file,final=false){
 if(!existsSync(file))return [];
 let text=readFileSync(file,'utf8');if(!final)text=text.slice(0,text.lastIndexOf('\n')+1);
 // Incomplete quoted multiline records are deferred until a later snapshot.
 try{return parse(text,{columns:true,skip_empty_lines:true,bom:true,relax_column_count:true});}
 catch(e){if(!final)return null;throw Error('Scraper CSV is incomplete. Saved prospects are retained; resume this search.');}
}
function patchJob(id,patch){const row=db.prepare('SELECT body FROM jobs WHERE id=?').get(id);db.prepare('UPDATE jobs SET body=? WHERE id=?').run(JSON.stringify({...JSON.parse(row.body),...patch}),id);}
export async function runDiscovery(job,command,emailLookup=collectEmails){
 const preview=job.type==='preview',campaign=job.body.id?get(job.body.id,'campaign'):null;
 const index=new Map(list('lead').map(l=>[dedupeKey(l),l]));
 // A queued job owns its area snapshot; directory changes apply only to future jobs.
 const areas=(job.body.scope==='region'&&job.body.areas?.length?job.body.areas:[job.body.location]).map(a=>({id:areaIdentity(a),location:typeof a==='string'?a:a.label}));
 const prior=job.body.collection;
 const result=job.body.resume&&job.body.result?{...job.body.result}:{added:0,duplicates:0,collected:0,remaining:0};
 const started=prior?.started||Date.now();
 const emailEnabled=job.body.findEmails&&!preview;
 const emailDone=new Set(result.emailDoneIds||[]);
 let emailTask=null,emailError=null,mapsFinished=false;
 if(emailEnabled&&job.body.resume){const linked=db.prepare('SELECT lead_id FROM job_leads WHERE job_id=?').all(job.id).map(row=>row.lead_id);result.emailLeadIds=[...new Set([...(result.emailLeadIds||[]),...linked])];}
 function startEmails(){
  if(!emailEnabled||emailTask||!(result.emailLeadIds||[]).some(id=>!emailDone.has(id)))return;
  emailTask=(async()=>{
   while(true){const ids=(result.emailLeadIds||[]).filter(id=>!emailDone.has(id)).slice(0,3);if(!ids.length)break;
    const counts=await emailLookup(ids,({checked,found})=>progress(job.id,{stage:mapsFinished?'Finding published emails':'Collecting Maps and finding published emails',emailsChecked:(result.emailsChecked||0)+checked,emailsFound:(result.emailsFound||0)+found}));
    result.emailsChecked=(result.emailsChecked||0)+counts.checked;result.emailsFound=(result.emailsFound||0)+counts.found;
    ids.forEach(id=>emailDone.add(id));result.emailDoneIds=[...emailDone];patchJob(job.id,{result});
   }
  })().catch(e=>{emailError=e;}).finally(()=>{emailTask=null;});
 }
 let budget=Math.min((job.body.batch??Infinity)-result.added,campaign?.target?Math.max(0,campaign.target-(campaign.totalAdded||0)):Infinity);
 const states=job.body.resume&&prior?.states?prior.states:areas.map(area=>{
  const matches=(campaign?.areaState||[]).filter(s=>s.id?s.id===area.id:areaIdentity(s)===areaIdentity(area.location));
  const saved=matches.length===1?matches[0]:null;
  if(matches.length>1)throw Error('Saved area progress is ambiguous for '+area.location+'. Review this search before collecting again.');
  if(saved&&!saved.id&&areas.filter(a=>areaIdentity(a.location)===areaIdentity(area.location)).length>1)throw Error('Saved area progress is ambiguous for '+area.location+'. Review this search before collecting again.');
  if(saved&&(saved.status!=='completed'||(!job.body.refreshRecent&&Date.now()-Date.parse(saved.finishedAt)<30*86400000)))return {...saved,...area};
  return {...area,status:'pending',cursor:0};
 });
 if(!prior&&areas.length===1&&campaign?.poolJobId&&campaign.poolRemaining>0&&!states[0].source){states[0].source=campaign.poolJobId;states[0].scraped=true;}
 let lastNew=Date.now(),lastProgress=Date.now(),duplicatesSinceNew=0;
 function save(stage){
  const fresh=campaign?get(campaign.id,'campaign'):null;if(fresh){fresh.areaState=[...(fresh.areaState||[]).filter(s=>!states.some(next=>areaIdentity(s)===areaIdentity(next)||(!s.id&&areaIdentity(s)===areaIdentity(next.location)))),...states];put('campaign',fresh);}
  patchJob(job.id,{collection:{states,started},result});
  progress(job.id,{stage,new:result.added,duplicates:result.duplicates,collected:result.collected,areasTotal:areas.length,areasDone:states.filter(s=>s.status==='completed').length,areasRemaining:states.filter(s=>s.status!=='completed').length,rate:Math.round(result.added/Math.max(1,(Date.now()-started)/60000)*10)/10,lastProgressAt:new Date(lastProgress).toISOString()});
 }
 save(job.body.resume?'Resuming saved areas':emailEnabled?'Collecting Maps and finding published emails':'Collecting Maps details only');
 startEmails();
 const errors=[];let attemptedAreas=0;
 for(let i=0;i<states.length&&budget>0;i++){
  const state=states[i];if(state.status==='completed')continue;
  attemptedAreas++;
  const source=state.source||(areas.length===1?job.id:path.join(job.id,'area-'+i));
  const dir=path.join(dataDir,'jobs',source),output=path.join(dir,'results.csv');
  state.source=source;state.status='running';state.error=null;mkdirSync(dir,{recursive:true});
  lastNew=Date.now();duplicatesSinceNew=0;
  let rows=[],failure=null,stopped=null;
  function flush(final=false){
   const snapshot=csvSnapshot(output,final);if(snapshot===null)return;rows=snapshot;if(preview)return;
   const next=rows.slice(state.cursor||0);if(!next.length||budget<=0)return;
   db.exec('BEGIN IMMEDIATE');
   try{
    const r=importLeads(JSON.stringify(next),Number.isFinite(budget)?budget:null,job.id,{track:true,index});
    state.cursor=(state.cursor||0)+r.consumed;if(emailEnabled)result.emailLeadIds=[...new Set([...(result.emailLeadIds||[]),...r.addedIds,...r.matchedIds])];result.added+=r.added;result.duplicates+=r.duplicates;result.collected+=r.consumed;budget-=r.added;
    if(r.needsReview?.length)result.needsReview=[...(result.needsReview||[]),...r.needsReview.map(item=>({...item,location:state.location,source:state.source}))];
    if(r.consumed)lastProgress=Date.now();
    if(r.added){lastNew=Date.now();duplicatesSinceNew=0;}else duplicatesSinceNew+=r.duplicates;
    const fresh=campaign?get(campaign.id,'campaign'):null;if(fresh){fresh.totalAdded=(fresh.totalAdded||0)+r.added;put('campaign',fresh);}
    save('Collecting: '+state.location);db.exec('COMMIT');startEmails();
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
  flush();
  if(!state.scraped&&budget>0){
   const s=settings(),binary=validateScraper(s),query=path.join(dir,'queries.txt');
   writeFileSync(query,job.body.keyword.replace(/[\r\n]/g,' ')+' in '+state.location.replace(/[\r\n]/g,' ')+'\n');
   const depth=preview?1:job.body.batch===null?1000:Math.min(1000,Math.max(10,Math.ceil(job.body.batch/15)));
   const resume=existsSync(output)?['-resume']:[];
   const controls={poll:()=>{flush();if(!preview&&budget<=0)return 'Batch limit reached';if(!preview&&duplicatesSinceNew>=100)return 'Only existing prospects found; area may be incomplete';if(Date.now()-lastNew>=5*60000)return 'No new prospects for five minutes; area may be incomplete';return null;}};
   try{
    const args=s.gosomMode==='docker'?['run','--rm','--name','discovery-'+job.id,'-v',dir+':/work','gosom/google-maps-scraper',...scraperArgs('/work/queries.txt','/work/results.csv',depth,job.body.concurrency||1),...resume]:[...scraperArgs(query,output,depth,job.body.concurrency||1),...resume];
    const outcome=await command(s.gosomMode==='docker'?'docker':binary,args,60*60000,path.join(dir,'scraper.log'),controls);
    stopped=outcome?.stopped;state.scraped=!stopped;
   }catch(e){failure=e;}
  }
  try{flush(true);}catch(e){failure=e;}
  if(preview){
   if(failure)throw failure;if(stopped)throw Error(stopped);
   if(!rows.length)throw Error('Scraper saved no businesses. Review the scraper log.');
   const unique=new Map();for(const row of rows){const lead=normalize(row);if(lead.name)unique.set(dedupeKey(lead),lead);}
   const old=list('preview').find(p=>p.key===job.body.key);put('preview',{id:old?.id||crypto.randomUUID(),key:job.body.key,keyword:job.body.keyword,location:job.body.location,createdAt:new Date().toISOString(),leads:[...unique.values()]});return;
  }
  if(!rows.length&&!failure)failure=Error('Scraper saved no businesses. Search may have been blocked or returned no usable results.');
  if(stopped&&stopped!=='Batch limit reached')failure=Error(stopped);
  state.status=failure?'incomplete':state.scraped&&(state.cursor||0)>=rows.length?'completed':'pending';
  state.finishedAt=new Date().toISOString();state.error=failure?.message||null;
  state.remaining=rows.slice(state.cursor||0).filter(row=>{const l=normalize(row);return l.name&&!index.has(dedupeKey(l));}).length;
  if(failure){state.scraped=false;errors.push(state.location+': '+failure.message);}
  result.remaining=states.reduce((n,s)=>n+(s.remaining||0),0);
  save(state.status==='completed'?'Area completed':state.status==='incomplete'?'Area incomplete — continuing queue':'Batch saved');
 }
 mapsFinished=true;
 if(emailEnabled){
  startEmails();await emailTask;if(emailError)throw emailError;
 }
 db.exec('BEGIN IMMEDIATE');try{
  // Chunk imports already accounted for totalAdded; finishCampaign applies stop rules only.
  result.skipped=attemptedAreas===0;
  result.nextEligibleAt=!job.body.refreshRecent&&states.every(s=>s.status==='completed')?new Date(Math.min(...states.map(s=>Date.parse(s.finishedAt)))+30*86400000).toISOString():null;
  finishCampaign(job,{added:result.added,countEmpty:attemptedAreas>0&&!errors.length},{countAdded:false});
  const fresh=campaign?get(campaign.id,'campaign'):null;
  if(fresh){fresh.poolJobId=areas.length===1&&result.remaining?states[0].source:null;fresh.poolRemaining=result.remaining;fresh.nextEligibleAt=result.nextEligibleAt;if(job.body.scope==='region'&&states.every(s=>s.status==='completed')){fresh.enabled=false;fresh.stopReason='All selected areas searched. Coverage is not guaranteed.';}else if(fresh.schedule&&result.nextEligibleAt&&Date.parse(fresh.nextRun)<Date.parse(result.nextEligibleAt)){fresh.nextRun=nextAllowed(fresh.schedule,result.nextEligibleAt);}put('campaign',fresh);}
  setConfig('lastImport',{...result,at:new Date().toISOString()});save(errors.length?'Partial results saved':result.skipped?'Recent areas skipped; eligible again '+result.nextEligibleAt:'Collection complete');db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 if(errors.length)throw Error(errors.length+' area(s) incomplete. Saved '+result.added+' new prospects. Resume retries unfinished areas. '+errors[0]);
}
