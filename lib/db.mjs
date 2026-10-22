import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';

export const dataDir = process.env.DISCOVERY_DATA_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.DISCOVERY_DATA_DIR) : path.join(process.cwd(),'data');
mkdirSync(dataDir,{recursive:true});
const db = new DatabaseSync(path.join(dataDir,'discovery.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, name TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER, expires INTEGER);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, error TEXT);
CREATE INDEX IF NOT EXISTS records_dashboard ON records(kind,json_extract(body,'$.status'),json_extract(body,'$.hot'),json_extract(body,'$.clickupId'),json_extract(body,'$.name'),json_extract(body,'$.address'),json_extract(body,'$.owner'),json_extract(body,'$.email'),json_extract(body,'$.rating'),json_extract(body,'$.reviews'),json_extract(body,'$.website'),json_extract(body,'$.lat'),json_extract(body,'$.lng'));
CREATE INDEX IF NOT EXISTS blocked_website_host ON records(json_extract(body,'$.websiteBlocked.host')) WHERE kind='lead' AND json_extract(body,'$.websiteBlocked') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS active_audit ON jobs(json_extract(body,'$.leadId'),type) WHERE status IN ('queued','running') AND type IN ('audit','research');`);
export default db;
export function list(kind) {return db.prepare('SELECT body FROM records WHERE kind=? ORDER BY rowid DESC').all(kind).map(r=>JSON.parse(r.body));}
export function get(id,kind) {const r=db.prepare('SELECT kind,body FROM records WHERE id=?').get(id);if(r&&kind&&r.kind!==kind)throw Error('Expected a '+kind+' record.');return r?JSON.parse(r.body):null;}
export function put(kind, value) {const result=db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE records.kind=excluded.kind').run(value.id,kind,JSON.stringify(value));if(!result.changes)throw Error('Record type cannot be changed.');return value;}
export function config(key, fallback=null) {const r=db.prepare('SELECT body FROM config WHERE key=?').get(key);return r?JSON.parse(r.body):fallback;}
export function setConfig(key,value) {db.prepare('INSERT INTO config VALUES(?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(key,JSON.stringify(value));}
export const defaults={agency:'Discovery Workspace',contactEmail:'',bookingUrl:'',gosomMode:'binary',gosomBinary:'',chromePath:'',aiProvider:'gemini',aiModel:'',aiEnabled:false,aiDailyLimit:10,clickupList:'',publicUrl:'http://localhost:3000'};
export function settings(){const s={...defaults,...config('settings',{})};if(s.agency===['Carl','Kurt'].join(' & '))s.agency='Discovery Workspace';return s;}
function encryptionKey(){const p=path.join(dataDir,'secret.key');if(!existsSync(p)){try{writeFileSync(p,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}}return readFileSync(p);}
export function saveSecret(name,value){if(value==='')return setConfig('secret:'+name,null);const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);setConfig('secret:'+name,[iv.toString('hex'),cipher.getAuthTag().toString('hex'),bytes.toString('hex')]);}
export function secret(name){const r=config('secret:'+name);if(!r)return '';const d=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(r[0],'hex'));d.setAuthTag(Buffer.from(r[1],'hex'));return Buffer.concat([d.update(Buffer.from(r[2],'hex')),d.final()]).toString();}
export function enqueue(type,body){const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,NULL)').run(id,type,'queued',JSON.stringify(body),now,now);return id;}
export function jobs(){return db.prepare('SELECT * FROM jobs ORDER BY created DESC').all().map(j=>({...j,body:JSON.parse(j.body)}));}
export function updateJob(id,status,error=null){const now=new Date().toISOString();db.exec('CREATE TABLE IF NOT EXISTS job_times(job_id TEXT PRIMARY KEY,started TEXT,finished TEXT)');if(status==='running')db.prepare('INSERT INTO job_times(job_id,started) VALUES(?,?) ON CONFLICT(job_id) DO UPDATE SET started=excluded.started,finished=NULL').run(id,now);else db.prepare('UPDATE job_times SET finished=? WHERE job_id=?').run(now,id);db.prepare('UPDATE jobs SET status=?,error=?,updated=? WHERE id=?').run(status,error,new Date().toISOString(),id);}
