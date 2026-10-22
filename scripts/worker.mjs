import {progress,logProgress,workerHeartbeat,tickWorkerHeartbeat} from '../lib/progress.mjs';
import {automaticBackup} from '../lib/backups.mjs';
import {applyResearch,saveReport} from '../lib/workflow.mjs';
import {sameWebsite} from '../lib/leads.mjs';
import {runDiscovery} from '../lib/discovery-run.mjs';
import {queueDueCampaigns,scheduledJobReady} from '../lib/scheduler.mjs';
import {websiteBlocked,stopWebsiteWork,isAccessBlocked,mapsOnlyMessage} from '../lib/maps-fallback.mjs';
import {spawn} from 'node:child_process';
import {existsSync,appendFileSync} from 'node:fs';
import db,{get,put,settings,config,setConfig,updateJob} from '../lib/db.mjs';
import {inspectWebsite,summarizeLighthouse} from '../lib/audit.mjs';
import {browserProxy,resolvePublic} from '../lib/network.mjs';
import lighthouse from 'lighthouse';
import {launch} from 'chrome-launcher';
const workerId=crypto.randomUUID();let stopping=false;
function heartbeat(){workerHeartbeat(workerId,stopping);}
heartbeat();
// A crashed worker never silently replays a job. The dashboard exposes the failure.
db.prepare("UPDATE jobs SET status='interrupted',error='Worker stopped. Saved results are retained; use Resume in job activity.',updated=? WHERE status='running'").run(new Date().toISOString());
const timer=setInterval(()=>tickWorkerHeartbeat(workerId,stopping),10000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
let activeJob=null,activeTarget=null;
function command(binary,args,timeout=60*60000,logFile=null,controls={}){return new Promise((resolve,reject)=>{
 const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let error='',buffer='',timedOut=false;
 const consume=d=>{const text=d.toString();error=(error+text).slice(-1000);if(logFile)appendFileSync(logFile,d);buffer+=text;const end=buffer.lastIndexOf('\n');if(end>=0){if(activeJob)logProgress(activeJob,buffer.slice(0,end));buffer=buffer.slice(end+1);}};
 child.stderr.on('data',consume);child.stdout.on('data',consume);
 let stopped=null,pollError=null;
 function stop(){if(binary==='docker'){spawn('docker',['stop',args[args.indexOf('--name')+1]],{windowsHide:true,stdio:'ignore'});}else if(process.platform==='win32'&&child.pid){spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}else child.kill();}
 const poll=setInterval(()=>{if(stopped||pollError)return;try{stopped=controls.poll?.();if(stopped)stop();}catch(e){pollError=e;stop();}},3000);
 const timer=setTimeout(()=>{timedOut=true;stop();},timeout);
 child.on('error',e=>{clearTimeout(timer);clearInterval(poll);reject(e);});child.on('close',code=>{clearTimeout(timer);clearInterval(poll);if(pollError)reject(pollError);else if(timedOut)reject(Error('Maximum runtime reached; saved results remain available.'));else if(stopped)resolve({stopped});else code===0?resolve():reject(Error('Process exited '+code+': '+error));});
});}
function findChrome(){const configured=settings().chromePath;if(configured)return configured;const options=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'];const found=options.find(p=>p&&existsSync(p));if(!found)throw Error('Set the Chrome/Edge executable path in Settings.');return found;}
async function research(id){
 const lead=get(id,'lead');if(!lead)throw Error('Lead no longer exists.');activeTarget=lead;
 if(['Do not contact','Disqualified'].includes(lead.status))throw Error('This lead is excluded from outreach.');
 if(websiteBlocked(lead))throw Error(mapsOnlyMessage);
 const result=await inspectWebsite(lead),latest=get(id,'lead');
 applyResearch(latest,result,lead);put('lead',latest);return latest;
}
async function audit(id){let lead=get(id,'lead');if(!lead?.hot&&!lead?.requested)throw Error('Lead is no longer marked hot or requesting an audit.');lead=await research(id);await resolvePublic(lead.website);const proxy=await browserProxy();let chrome;
try{chrome=await launch({chromePath:findChrome(),chromeFlags:['--headless=new','--disable-gpu','--disable-quic',`--proxy-server=http://127.0.0.1:${proxy.port}`,'--proxy-bypass-list=<-loopback>','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});const runs={};for(const device of ['mobile','desktop']){if(activeJob)progress(activeJob,{stage:'Auditing '+device});const result=await lighthouse(lead.website,{port:chrome.port,output:'json',logLevel:'error',onlyCategories:['performance','accessibility','best-practices','seo'],maxWaitForLoad:45000, ...(device==='desktop'?{formFactor:'desktop',screenEmulation:{mobile:false,width:1350,height:940,deviceScaleFactor:1,disabled:false}}:{})});if(result.lhr.runtimeError)throw Error(result.lhr.runtimeError.message);runs[device]=summarizeLighthouse(result.lhr,device);}const report={id:crypto.randomUUID(),kind:'report',leadId:id,business:lead.name,website:lead.website,address:lead.address,findings:lead.findings,createdAt:new Date().toISOString(),...runs,shareToken:null};saveReport(lead,report);}finally{if(chrome)await chrome.kill();proxy.close();}}
console.log('Discovery worker is online. Ctrl+C stops after the current job.');
while(!stopping){try{automaticBackup();}catch(e){console.error('Backup failed:',e.message);}if(config('workerControl')?.paused){if(process.argv.includes('--once'))break;await new Promise(r=>setTimeout(r,3000));continue;}queueDueCampaigns();
const row=db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created").all().find(r=>scheduledJobReady({...r,body:JSON.parse(r.body)}));if(!row){if(process.argv.includes('--once'))break;await new Promise(r=>setTimeout(r,3000));continue;}const job={...row,body:JSON.parse(row.body)};updateJob(job.id,'running');activeJob=job.id;activeTarget=null;progress(job.id,{stage:job.type==='research'?'Researching website':job.type==='audit'?'Preparing audit':'Starting search'});console.log('Running',job.type,job.id);try{if(['research','audit'].includes(job.type)&&websiteBlocked(get(job.body.leadId,'lead'))){updateJob(job.id,'skipped',mapsOnlyMessage);continue;}if(job.type==='research')await research(job.body.leadId);else if(job.type==='audit')await audit(job.body.leadId);else if((job.type==='discovery'||job.type==='preview'))await runDiscovery(job,command);else throw Error('Unknown job type.');updateJob(job.id,'completed');progress(job.id,{stage:'Completed'});console.log('Completed',job.id);}catch(e){if(['research','audit'].includes(job.type)&&isAccessBlocked(e)&&sameWebsite(get(job.body.leadId,'lead'),activeTarget)){stopWebsiteWork(job.body.leadId,e.message,activeTarget);updateJob(job.id,'skipped',mapsOnlyMessage);progress(job.id,{stage:'Maps only — website blocked',blocked:1});console.log(mapsOnlyMessage);}else{updateJob(job.id,'failed',e.message);console.error('Failed:',e.message);}}if(process.argv.includes('--once'))break;}
clearInterval(timer);setConfig('worker',{id:workerId,at:Date.now(),running:false});db.close();

