import db,{get,put} from './db.mjs';
db.exec(`CREATE TABLE IF NOT EXISTS job_leads(job_id TEXT,lead_id TEXT,recovered INTEGER DEFAULT 0,PRIMARY KEY(job_id,lead_id));
CREATE TABLE IF NOT EXISTS job_times(job_id TEXT PRIMARY KEY,started TEXT,finished TEXT);`);
export function linkLead(jobId,leadId,recovered=false){if(jobId)db.prepare('INSERT OR IGNORE INTO job_leads VALUES(?,?,?)').run(jobId,leadId,recovered?1:0);}
export function jobLinks(){return db.prepare('SELECT job_id AS jobId,lead_id AS leadId,recovered FROM job_leads').all();}
export function deleteSearches(ids,restore=false){if(!Array.isArray(ids)||!ids.length||ids.length>500)throw Error('Select saved searches first.');db.exec('BEGIN IMMEDIATE');try{for(const id of new Set(ids)){const c=get(id,'campaign');if(!c||!db.prepare("SELECT id FROM records WHERE id=? AND kind='campaign'").get(id))throw Error('Saved search not found.');c.enabled=false;c.deletedAt=restore?null:new Date().toISOString();put('campaign',c);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true};}
export function timedJobs(rows){const times=new Map(db.prepare('SELECT * FROM job_times').all().map(t=>[t.job_id,t]));return rows.map(j=>({...j,startedAt:times.get(j.id)?.started||null,finishedAt:times.get(j.id)?.finished||null}));}
