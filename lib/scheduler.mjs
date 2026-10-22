import db,{list,get,put,enqueue} from './db.mjs';
import {allowedAt,nextAllowed,followingRun} from './schedule.mjs';
export function queueDueCampaigns(now=Date.now()){
 for(const c of list('campaign')){
  if(c.deletedAt||!c.enabled||new Date(c.nextRun).getTime()>now)continue;
  db.exec('BEGIN IMMEDIATE');
  try{const fresh=get(c.id,'campaign');
   if(!fresh.deletedAt&&fresh.enabled&&new Date(fresh.nextRun).getTime()<=now){
    if(!allowedAt(fresh.schedule,now))fresh.nextRun=nextAllowed(fresh.schedule,now);
    else if((fresh.target&&fresh.totalAdded>=fresh.target)||(fresh.emptyStop&&fresh.emptyRuns>=fresh.emptyStop)){fresh.enabled=false;fresh.stopReason='Batch stop condition reached';}
    else if(!db.prepare("SELECT id FROM jobs WHERE type='discovery' AND status IN ('queued','running') AND json_extract(body,'$.id')=?").get(c.id)){
     enqueue('discovery',{...fresh,scheduled:true});fresh.nextRun=followingRun(fresh.schedule,now);
    }
    put('campaign',fresh);
   }db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
}
export function scheduledJobReady(job,now=Date.now()){
 if(!job.body.scheduled)return true;
 const c=get(job.body.id,'campaign');
 if(!c||c.deletedAt||!c.enabled){db.prepare("UPDATE jobs SET status='cancelled',error='Schedule paused or deleted.',updated=? WHERE id=?").run(new Date(now).toISOString(),job.id);return false;}
 return allowedAt(c.schedule,now);
}
