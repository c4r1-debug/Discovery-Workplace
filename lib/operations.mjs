import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {jobs,enqueue} from './db.mjs';
import {nextAllowed,followingRun} from './schedule.mjs';
import {selectedRegionAreas} from './locations.mjs';
export function upcoming(c){const result=[];let at=nextAllowed(c.schedule,Math.max(Date.now(),Date.parse(c.nextRun)));for(let i=0;i<5;i++){result.push(at);at=followingRun(c.schedule,at);}return result;}
export function campaignOptions(p,old){
 const target=p.target===''||p.target==null?null:Number(p.target),emptyStop=Number(p.emptyStop??3);
 if(target!==null&&(!Number.isSafeInteger(target)||target<1))throw Error('Total target must be a positive whole number.');
 if(!Number.isInteger(emptyStop)||emptyStop<1||emptyStop>100)throw Error('Choose 1–100 empty runs before stopping.');
 if(old&&jobs().some(j=>j.body.id===old.id&&['running','queued'].includes(j.status)))throw Error('Wait for or cancel the active batch before editing this schedule.');
 const scope=p.scope??old?.scope??'single';if(!['single','region'].includes(scope))throw Error('Choose a valid search scope.');
 const concurrency=Number(p.concurrency??old?.concurrency??2);if(![1,2].includes(concurrency))throw Error('Choose 1 or 2 concurrent Maps pages.');
 const changed=old&&(old.keyword!==p.keyword||old.location!==p.location||old.scope!==scope);
 const selection=scope==='region'?selectedRegionAreas(p.location,p.selectedAreas===undefined&&!changed?old?.selectedAreas:p.selectedAreas,p.manualAreas??(!changed?old?.manualAreas:'')??''):{areas:null};
 return {...(!changed&&old?{poolJobId:old.poolJobId,poolRemaining:old.poolRemaining,totalAdded:old.totalAdded,accountedJobs:old.accountedJobs,areaState:old.areaState}:{}),scope,...selection,concurrency,findEmails:p.findEmails??old?.findEmails??true,refreshRecent:!!p.refreshRecent,target,emptyStop,emptyRuns:0,stopReason:null};
}
export function queueCampaign(c){if(jobs().some(j=>j.type==='discovery'&&j.body.id===c.id&&['running','queued'].includes(j.status)))throw Error('This search already has an active batch.');return enqueue('discovery',c);}
export function startupEnabled(){return process.platform==='win32'&&(existsSync(path.join(process.cwd(),'data/background-worker.json'))||existsSync(path.join(process.env.APPDATA||'','Microsoft/Windows/Start Menu/Programs/Startup/DiscoveryWorker.vbs')));}
export function changeStartup(enabled){if(process.platform!=='win32')throw Error('Windows startup is available only on Windows.');const r=spawnSync('powershell.exe',['-NoProfile','-File',path.join(process.cwd(),'scripts/install-worker-startup.ps1'),'-Mode',enabled?'enable':'disable','-NodePath',process.execPath],{windowsHide:true,encoding:'utf8',timeout:15000});if(r.error||r.status!==0)throw Error('Could not change Windows startup: '+(r.error?.message||r.stderr));return {enabled:startupEnabled()};}
