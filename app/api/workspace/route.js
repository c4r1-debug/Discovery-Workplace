import {createHash} from 'node:crypto';
import {criteria,qualification,contactEvidence,brief,history,recordEvent,updateWorkflow,handoffPreview} from '../../../lib/workflow.mjs';
import {backups,createBackup,restoreBackup} from '../../../lib/backups.mjs';
import {retryJob,workerControl} from '../../../lib/progress.mjs';
import {upcoming,campaignOptions,queueCampaign,startupEnabled,changeStartup} from '../../../lib/operations.mjs';
import {prospectPage,prospectIds,prospectStats,prospectSummary} from '../../../lib/prospect-query.mjs';
import {NextResponse} from 'next/server';
import db,{list,get,put,config,setConfig,settings,saveSecret,secret,enqueue,jobs} from '../../../lib/db.mjs';
import {setupNeeded,login,logout,userFrom,rateLimit} from '../../../lib/auth.mjs';
import {importLeads,patchLead,normalize,webUrl,sameWebsite} from '../../../lib/leads.mjs';
import {sendClickup,draftOutreach} from '../../../lib/integrations.mjs';
import {register,resetPassword,renewRecovery,roleFor} from '../../../lib/accounts.mjs';
import {validateScraper,scraperPath} from '../../../lib/scraper.mjs';
import {websiteBlocked,compactJobs,mapsOnlyMessage} from '../../../lib/maps-fallback.mjs';
import {jobLinks,timedJobs,deleteSearches} from '../../../lib/activity.mjs';
import {batchLimit,previewKey} from '../../../lib/search-options.mjs';
import {prospectsCSV} from '../../../lib/export.mjs';
import {validateSchedule,nextAllowed} from '../../../lib/schedule.mjs';
import {isWorkerOnline} from '../../../lib/worker-status.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
function jobSummary(job){const {areas,areaState,collection,result,...body}=job.body;const {emailLeadIds,emailDoneIds,...summary}=result||{};return {...job,body:{...body,...(result?{result:summary}:{})}};}
export async function GET(req){try{
 const user=userFrom(req);if(!user)return json({setup:setupNeeded(),user:null});
 const params=Object.fromEntries(new URL(req.url).searchParams);
 if(params.ids==='true')return json({ids:prospectIds(params)});
 if(params.jobId||params.campaignIds){
  const page=prospectPage(params);
  const ids=page.leads.map(l=>l.id),rows=ids.length?db.prepare(`SELECT * FROM jobs WHERE json_extract(body,'$.leadId') IN (${ids.map(()=>'?').join(',')}) ORDER BY created DESC`).all(...ids):[];
  const row=params.jobId?db.prepare('SELECT * FROM jobs WHERE id=?').get(params.jobId):null;
  return json({...page,job:row?{...row,body:JSON.parse(row.body)}:null,leadJobs:timedJobs(compactJobs(rows.map(j=>({...j,body:JSON.parse(j.body)}))))});
 }
 const full=!['discover','prospects','schedule','territories','reports','settings'].includes(params.view);
 const stats=prospectStats(),page=full||params.view==='prospects'?prospectPage(params):{leads:[],total:0,page:1,pages:1};
 const selected=params.leadId?get(params.leadId,'lead'):null;
 const needJobs=full||['schedule','territories','settings'].includes(params.view);
 let work=[];
 if(needJobs){
  const linked=new Set(db.prepare('SELECT DISTINCT lead_id FROM job_leads').all().map(r=>r.lead_id));
  const counts=new Map(db.prepare('SELECT job_id,count(*) n FROM job_leads GROUP BY job_id').all().map(r=>[r.job_id,r.n]));
  const leadName=db.prepare("SELECT json_extract(body,'$.name') name FROM records WHERE id=? AND kind='lead'");
  work=timedJobs(compactJobs(jobs())).map(j=>({...jobSummary(j),linkedCount:counts.get(j.id)||0,linked:linked.has(j.body.leadId),leadName:!linked.has(j.body.leadId)&&j.body.leadId?leadName.get(j.body.leadId)?.name:undefined}));
 }
 else if(params.previewKey)work=timedJobs(db.prepare("SELECT * FROM jobs WHERE type='preview' AND json_extract(body,'$.key')=? ORDER BY created DESC LIMIT 1").all(params.previewKey).map(j=>({...j,body:JSON.parse(j.body)}))).map(jobSummary);
 const campaigns=full||['schedule','territories'].includes(params.view)?list('campaign').filter(c=>!c.deletedAt).map(c=>({...c,upcoming:upcoming(c)})):[];
 const reports=full||params.view==='reports'?db.prepare("SELECT json_extract(body,'$.id') id,json_extract(body,'$.business') business,json_extract(body,'$.createdAt') createdAt,json_extract(body,'$.shareToken') shareToken,json_extract(body,'$.approvedBy') approvedBy FROM records WHERE kind='report' ORDER BY rowid DESC").all():[];
 const previews=full?db.prepare("SELECT body FROM records WHERE kind='preview' ORDER BY rowid DESC LIMIT 20").all().map(r=>JSON.parse(r.body)):params.previewKey?db.prepare("SELECT body FROM records WHERE kind='preview' AND json_extract(body,'$.key')=? ORDER BY rowid DESC LIMIT 1").all(params.previewKey).map(r=>JSON.parse(r.body)):[];
 if(!full)for(const preview of previews)preview.leads=preview.leads.map(prospectSummary);
 const worker=config('worker');
 return json({user,view:params.view,role:roleFor(user),leads:page.leads,prospectPage:{total:page.total,page:page.page,pages:page.pages},stats,selectedLead:selected?{...selected,evidence:contactEvidence(selected),qualificationSummary:qualification(selected),brief:brief(selected)}:null,criteria:criteria(),team:db.prepare('SELECT name FROM users ORDER BY name').all().map(u=>u.name),events:selected?history(selected.id):[],workerControl:config('workerControl',{paused:false}),startupEnabled:startupEnabled(),backupEnabled:config('backupEnabled',true),backups:(full||params.view==='settings')&&roleFor(user)==='admin'?backups():[],reports,campaigns,previews,jobs:work,settings:settings(),credentials:{ai:!!secret('ai'),clickup:!!secret('clickup')},worker,workerOnline:isWorkerOnline(worker),aiUsage:config('aiUsage')});
}catch(e){return json({error:e.message},400);}}
export async function POST(req){try{const host=req.headers.get('host');const origin=req.headers.get('origin');if(!origin||new URL(origin).host!==host)return json({error:'Invalid request origin.'},403);const raw=await req.text();if(raw.length>5*1024*1024)return json({error:'Request is too large.'},413);const b=JSON.parse(raw);let user=userFrom(req);
if(b.action==='register'){if(!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))throw Error('Account creation is available only on this laptop.');rateLimit('register',5);return json(register(b.name,b.password));}
if(b.action==='resetPassword'){rateLimit('reset-global',20);rateLimit('reset:'+String(b.name).trim().toLowerCase(),5,15*60000);return json(resetPassword(b.name,b.code,b.password));}
if(b.action==='login'){rateLimit('login-global',30);rateLimit('login:'+String(b.name).trim().toLowerCase(),10);const token=login(b.name,b.password);const r=json({ok:true});r.cookies.set('discovery_session',token,{httpOnly:true,sameSite:'strict',secure:new URL(origin).protocol==='https:',maxAge:604800,path:'/'});return r;}
if(!user)return json({error:'Please sign in.'},401);
if(b.action==='renewRecovery'){rateLimit('recovery:'+user,5);return json(renewRecovery(user,b.password));}
if(b.action==='logout'){logout(req);const r=json({ok:true});r.cookies.delete('discovery_session');return r;}

if(b.action==='workflow')return json(updateWorkflow(b.id,b.patch||{},user));
if(b.action==='handoffPreview'){const lead=get(b.id,'lead');if(!lead)throw Error('Prospect not found.');const preview=handoffPreview(lead);return json({...preview,token:createHash('sha256').update(JSON.stringify(preview)).digest('hex')});}
if(b.action==='retryJob')return json(retryJob(b.id));
if(b.action==='workerControl')return json(workerControl({paused:!!b.paused}));
if(['backup','restoreBackup','backupSettings','startup','criteria'].includes(b.action)){
 if(roleFor(user)!=='admin')throw Error('Workspace administrator required.');
 if(b.action==='backup')return json(createBackup());
 if(b.action==='restoreBackup')return json(restoreBackup(b.id));
 if(b.action==='backupSettings'){setConfig('backupEnabled',!!b.enabled);return json({ok:true});}
 if(b.action==='startup'){if(!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))throw Error('Configure Windows startup on this laptop.');return json(changeStartup(!!b.enabled));}
 if(!Array.isArray(b.items))throw Error('Enter qualification requirements.');const items=[...new Set(b.items.map(v=>String(v).trim()).filter(Boolean))];if(!items.length||items.length>12||items.some(v=>v.length>150))throw Error('Use 1–12 requirements, each under 150 characters.');setConfig('qualificationCriteria',items);return json({ok:true});
}
if(b.action==='export'){const format=b.format||'complete';if(!['complete','gohighlevel'].includes(format))throw Error('Unsupported CSV format.');const ids=Array.isArray(b.ids)?new Set(b.ids):null;const selected=list('lead').filter(l=>!ids||ids.has(l.id));return new NextResponse(prospectsCSV(selected,format==='complete'?list('report'):[],format),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="discovery-prospects.csv"','Cache-Control':'no-store'}});}
if(b.action==='preview'){const keyword=String(b.keyword||'').trim().slice(0,150),location=String(b.location||'').trim().slice(0,200);if(!keyword||!location)throw Error('Enter a keyword and location.');validateScraper(settings());const key=previewKey(keyword,location);const existing=jobs().find(j=>j.type==='preview'&&j.body.key===key&&['queued','running'].includes(j.status));if(existing)return json({id:existing.id});const cached=list('preview').find(p=>p.key===key);if(cached&&!b.refresh)return json({id:cached.id});rateLimit('preview',10,60000);return json({id:enqueue('preview',{keyword,location,key,batch:20})});}
if(b.action==='import')return json(importLeads(String(b.text||''),10000));
if(b.action==='add'){const lead=normalize(b.lead||{});if(!lead.name)throw Error('Business name is required.');return json(importLeads(JSON.stringify([b.lead]),1));}
if(b.action==='lead'){const before=get(b.id,'lead'),lead=patchLead(b.id,b.patch||{});recordEvent(b.id,user,'Updated prospect',Object.fromEntries(Object.keys(b.patch||{}).filter(k=>JSON.stringify(before?.[k])!==JSON.stringify(lead[k])).map(k=>[k,{from:before?.[k]??null,to:lead[k]}])));return json(lead);}
if(b.action==='website'){if(!webUrl(b.website))throw Error('Enter an HTTP/HTTPS website URL.');return json(patchLead(b.id,{website:b.website}));}
if(b.action==='research'||b.action==='audit'){const lead=get(b.id,'lead');if(!lead?.website)throw Error('A website is required.');if(websiteBlocked(lead))throw Error(mapsOnlyMessage);if(['Do not contact','Disqualified'].includes(lead.status))throw Error('This lead is excluded from outreach.');if(b.action==='audit'&&!lead.hot&&!lead.requested)throw Error('Mark the lead hot or record an audit request first.');return json({id:enqueue(b.action,{leadId:b.id})});}
if(b.action==='deleteSearches'||b.action==='restoreSearches')return json(deleteSearches(b.ids,b.action==='restoreSearches'));
if(b.action==='cancel'){db.prepare("UPDATE jobs SET status='cancelled' WHERE id=? AND status='queued'").run(b.id);return json({ok:true});}
if(b.action==='campaign'){if(b.run||b.campaign?.enabled)validateScraper(settings());const p=b.campaign||{};if(!String(p.keyword||'').trim()||!String(p.location||'').trim())throw Error('Enter a keyword and location.');const old=p.id?get(p.id,'campaign'):null;if(p.id&&!old)throw Error('Search not found.');const options=campaignOptions(p,old);const c={...options,id:old?.id||crypto.randomUUID(),keyword:String(p.keyword).slice(0,150),location:String(p.location).slice(0,200),batch:batchLimit(p.batch),schedule:validateSchedule(p.schedule),enabled:!!p.enabled,nextRun:old?.nextRun||new Date(Date.now()+7*86400000).toISOString(),createdAt:old?.createdAt||new Date().toISOString()};if(c.schedule){if(c.batch===null||c.batch>500)throw Error('Scheduled batches must contain 1 to 500 prospects.');c.nextRun=nextAllowed(c.schedule,c.schedule.startAt);}put('campaign',c);if(b.run)queueCampaign(c);return json(c);}
if(b.action==='runCampaign'){validateScraper(settings());const c=get(b.id,'campaign');if(!c||c.deletedAt)throw Error('Search not found.');return json({id:queueCampaign(c)});}
if(b.action==='toggleCampaign'){if(b.enabled)validateScraper(settings());const c=get(b.id,'campaign');if(!c)throw Error('Search not found.');c.enabled=!!b.enabled;return json(put('campaign',c));}
if(b.action==='settings'){const s=settings(),p=b.settings||{};for(const k of ['agency','contactEmail','bookingUrl','gosomBinary','chromePath','aiModel','clickupList','publicUrl'])if(k in p)s[k]=String(p[k]).slice(0,2000);if(p.aiProvider&&!['gemini','deepseek','opencode'].includes(p.aiProvider))throw Error('Unsupported AI provider.');if(p.aiProvider)s.aiProvider=p.aiProvider;if(p.gosomMode)s.gosomMode=p.gosomMode==='docker'?'docker':'binary';s.aiEnabled=!!p.aiEnabled;s.aiDailyLimit=Math.min(100,Math.max(1,Number(p.aiDailyLimit)||10));if(s.publicUrl&&!webUrl(s.publicUrl))throw Error('Public URL must be HTTP/HTTPS.');s.publicUrl=s.publicUrl.replace(/\/$/,'');if(s.bookingUrl&&!webUrl(s.bookingUrl))throw Error('Booking URL must be HTTP/HTTPS.');if(s.gosomMode!=='docker'&&s.gosomBinary)s.gosomBinary=scraperPath(s.gosomBinary);setConfig('settings',s);for(const k of ['ai','clickup'])if(typeof b.secrets?.[k]==='string'&&b.secrets[k])saveSecret(k,b.secrets[k]);return json({ok:true});}
if(b.action==='draft'){const lead=get(b.id,'lead');if(!lead||!lead.findings?.length)throw Error('Run website research first.');if(['Do not contact','Disqualified'].includes(lead.status))throw Error('This lead is excluded from outreach.');const draft=await draftOutreach(lead),latest=get(b.id,'lead');if(!latest||['Do not contact','Disqualified'].includes(latest.status)||!sameWebsite(latest,lead)||JSON.stringify(latest.findings)!==JSON.stringify(lead.findings))throw Error('Prospect changed while drafting. Review current details before trying again.');latest.draft=draft;put('lead',latest);return json({draft});}
if(b.action==='share'){if(roleFor(user)!=='admin')throw Error('A workspace administrator must review and approve reports.');const report=get(b.id,'report');if(!report||report.kind!=='report')throw Error('Report not found.');if(b.approve){report.shareToken=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');report.approvedBy=user;report.approvedAt=new Date().toISOString();report.agency=settings().agency;report.contactEmail=settings().contactEmail;report.bookingUrl=settings().bookingUrl;}else{report.shareToken=null;report.approvedAt=null;}put('report',report);return json({ok:true});}
if(b.action==='clickup'){const lead=get(b.id,'lead');if(!lead)throw Error('Prospect not found.');const expected=createHash('sha256').update(JSON.stringify(handoffPreview(lead))).digest('hex');if(b.previewToken!==expected)throw Error('Review a fresh handoff preview before sending.');const result=await sendClickup(b.id);recordEvent(b.id,user,'Sent to ClickUp',result.clickupUrl);return json(result);}
if(b.action==='clearClickupPending'){const lead=get(b.id,'lead');if(!lead)throw Error('Lead not found.');lead.clickupPending=false;put('lead',lead);return json({ok:true});}
return json({error:'Unknown action.'},400);
}catch(e){return json({error:String(e.message).includes('UNIQUE')?'This job is already queued or running.':e.message||'Operation failed.'},400);}}
