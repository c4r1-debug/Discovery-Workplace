import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync,copyFileSync,cpSync,lstatSync,renameSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createDecipheriv} from 'node:crypto';
import path from 'node:path';
import db,{dataDir,config,setConfig} from './db.mjs';
const tables=['users','records','config','jobs','job_times','job_leads'];
const root=path.join(dataDir,'backups');
export function backups(){if(!existsSync(root))return [];return readdirSync(root).filter(id=>/^[\dTZ-]+-[a-f0-9-]+$/.test(id)&&existsSync(path.join(root,id,'snapshot.json'))).sort().reverse().map(id=>({id,createdAt:id.slice(0,19).replace(/T(\d{2})-(\d{2})-(\d{2})/,'T$1:$2:$3')+'Z'}));}
export function createBackup({record=true}={}){
 const id=new Date().toISOString().replaceAll(':','-').replace(/\.\d{3}/,'')+'-'+crypto.randomUUID(),dir=path.join(root,id);mkdirSync(dir,{recursive:true});
 const snapshot={version:1,createdAt:new Date().toISOString(),tables:{}};
 db.exec('BEGIN');try{for(const table of tables)if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))snapshot.tables[table]=db.prepare(`SELECT * FROM ${table}`).all();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 if(existsSync(path.join(dataDir,'secret.key')))copyFileSync(path.join(dataDir,'secret.key'),path.join(dir,'secret.key'));
 // Keep resumable scraper files alongside the database snapshot.
 if(existsSync(path.join(dataDir,'jobs')))cpSync(path.join(dataDir,'jobs'),path.join(dir,'jobs'),{recursive:true});
 writeFileSync(path.join(dir,'snapshot.json'),JSON.stringify(snapshot),{mode:0o600});if(record)setConfig('lastBackup',{id,at:Date.now()});return {id};
}
function replaceTables(connection,snapshot,schema){
 for(const {name} of schema){connection.prepare(`DELETE FROM ${name}`).run();for(const row of snapshot.tables[name]||[]){const keys=Object.keys(row);connection.prepare(`INSERT INTO ${name} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}}
}
function validateSnapshot(snapshot,dir){
 if(snapshot.version!==1||!snapshot.tables||!Array.isArray(snapshot.tables.users)||!snapshot.tables.users.length||!Array.isArray(snapshot.tables.records))throw Error('Invalid backup.');
 const schema=tables.map(name=>db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name=?").get(name)).filter(Boolean);
 for(const [table,rows] of Object.entries(snapshot.tables)){
  if(!tables.includes(table)||!Array.isArray(rows))throw Error('Backup schema is incompatible.');
  const columns=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
  for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||!Object.keys(row).length||Object.keys(row).some(k=>!columns.has(k)))throw Error('Backup schema is incompatible.');if('body' in row)JSON.parse(row.body);}
 }
 const trial=new DatabaseSync(':memory:');
 try{for(const {sql} of schema)trial.exec(sql);for(const {name} of schema)for(const {sql} of db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(name))trial.exec(sql);replaceTables(trial,snapshot,schema);}finally{trial.close();}
 const keyPath=path.join(dir,'secret.key');
 const key=existsSync(keyPath)?(lstatSync(keyPath).isFile()?readFileSync(keyPath):null):null;
 if(existsSync(keyPath)&&key?.length!==32)throw Error('Invalid backup encryption key.');
 for(const row of snapshot.tables.config||[]){if(!row.key.startsWith('secret:'))continue;const value=JSON.parse(row.body);if(!value)continue;if(!key||!Array.isArray(value)||value.length!==3)throw Error('Backup encryption key is missing or invalid.');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value[0],'hex'));decipher.setAuthTag(Buffer.from(value[1],'hex'));decipher.update(Buffer.from(value[2],'hex'));decipher.final();}
 return schema;
}
export function restoreBackup(id){
 if(!backups().some(b=>b.id===id))throw Error('Backup not found.');
 if(!config('workerControl')?.paused||db.prepare("SELECT id FROM jobs WHERE status='running'").get())throw Error('Pause the worker and wait for its current job to finish before restoring.');
 const dir=path.join(root,id),snapshot=JSON.parse(readFileSync(path.join(dir,'snapshot.json'),'utf8'));
 const schema=validateSnapshot(snapshot,dir),stage=mkdtempSync(path.join(dataDir,'.restore-'));
 const files=['jobs','secret.key'].map(name=>({live:path.join(dataDir,name),next:path.join(stage,name),prior:path.join(stage,'previous-'+name),moved:false,installed:false}));
 let safety,transaction=false,keepStage=false;
 try{
  const sourceJobs=path.join(dir,'jobs');
  if(existsSync(sourceJobs)){if(!lstatSync(sourceJobs).isDirectory())throw Error('Invalid backup jobs directory.');cpSync(sourceJobs,files[0].next,{recursive:true,filter:source=>{if(lstatSync(source).isSymbolicLink())throw Error('Backup jobs cannot contain symbolic links.');return true;}});}else mkdirSync(files[0].next);
  if(existsSync(path.join(dir,'secret.key')))copyFileSync(path.join(dir,'secret.key'),files[1].next);
  safety=createBackup({record:false});
  db.exec('BEGIN IMMEDIATE');transaction=true;
  if(!config('workerControl')?.paused||db.prepare("SELECT id FROM jobs WHERE status='running'").get())throw Error('Pause the worker and wait for its current job to finish before restoring.');
  const currentWorker=config('worker');
  replaceTables(db,snapshot,schema);
  db.exec('DELETE FROM sessions; DELETE FROM limits;');db.prepare("UPDATE jobs SET status='interrupted',error='Restored from backup. Resume deliberately.' WHERE status IN ('running','queued')").run();setConfig('workerControl',{paused:true});setConfig('worker',currentWorker);setConfig('lastBackup',{id:safety.id,at:Date.now()});
  // Keep both previous paths until the database commits, so a failed swap can be undone.
  for(const file of files){if(existsSync(file.live)){renameSync(file.live,file.prior);file.moved=true;}if(existsSync(file.next)){renameSync(file.next,file.live);file.installed=true;}}
  db.exec('COMMIT');transaction=false;
 }catch(error){
  const failures=[];
  if(transaction)try{db.exec('ROLLBACK');}catch(e){failures.push(e);}
  for(const file of files.toReversed())try{if(file.installed)rmSync(file.live,{recursive:true,force:true});if(file.moved)renameSync(file.prior,file.live);}catch(e){failures.push(e);}
  if(failures.length){keepStage=true;throw new AggregateError([error,...failures],`Restore failed; recovery files retained at ${stage}, safety backup ${safety?.id||'not created'}.`);}
  throw error;
 }finally{if(!keepStage)try{rmSync(stage,{recursive:true,force:true});}catch{/* A cleanup failure must not report a committed restore as rejected. */}}
 return {ok:true,safetyBackup:safety.id};
}
export function automaticBackup(){if(config('backupEnabled',true)&&Date.now()-(config('lastBackup')?.at||0)>86400000)createBackup();}
