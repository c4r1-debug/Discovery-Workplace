import test from 'node:test';
import assert from 'node:assert/strict';
import fs,{mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';

process.env.DISCOVERY_DATA_DIR=mkdtempSync(path.join(tmpdir(),'discovery-backup-regression-'));
const {default:db,dataDir,put,get,setConfig,config,saveSecret,secret,enqueue}=await import('../lib/db.mjs');
const {createBackup,restoreBackup,backups}=await import('../lib/backups.mjs');
db.prepare('INSERT INTO users VALUES(?,?)').run('fixture-owner','fixture-hash');
setConfig('workerControl',{paused:true});

function database(){return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]);}
function fileHashes(dir){return existsSync(dir)?readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{const file=path.join(dir,entry.name);return entry.isDirectory()?fileHashes(file).map(([name,hash])=>[entry.name+'/'+name,hash]):[[entry.name,createHash('sha256').update(readFileSync(file)).digest('hex')]];}):[];}
function currentState(){return {database:database(),jobs:fileHashes(path.join(dataDir,'jobs')),key:existsSync(path.join(dataDir,'secret.key'))?readFileSync(path.join(dataDir,'secret.key')).toString('hex'):null};}

test('restore replaces jobs exactly, handles absent jobs/key, and rolls back every rejected restore',()=>{
 const empty=createBackup();
 const jobDir=path.join(dataDir,'jobs','fixture');mkdirSync(jobDir,{recursive:true});
 writeFileSync(path.join(jobDir,'later.csv'),'title,place_id\nLater,not-in-snapshot');saveSecret('ai','later-secret');
 restoreBackup(empty.id);
 assert.deepEqual(readdirSync(path.join(dataDir,'jobs')),[],'missing backup jobs means an empty tree');
 assert.equal(existsSync(path.join(dataDir,'secret.key')),false,'missing backup key clears the later key');

 mkdirSync(jobDir,{recursive:true});writeFileSync(path.join(jobDir,'results.csv'),'title,place_id\nSaved,saved-id');
 put('lead',{id:'saved-lead',name:'Saved'});saveSecret('ai','saved-secret');
 const queued=enqueue('discovery',{keyword:'fixture',location:'fixture'}),saved=createBackup();
 writeFileSync(path.join(jobDir,'results.csv'),'changed checkpoint');writeFileSync(path.join(jobDir,'later.csv'),'later result');
 put('lead',{id:'later-lead',name:'Later'});writeFileSync(path.join(dataDir,'secret.key'),Buffer.alloc(32,7));saveSecret('ai','new-secret');
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('session','fixture-owner',Date.now()+60000);
 const restored=restoreBackup(saved.id);
 assert.equal(readFileSync(path.join(jobDir,'results.csv'),'utf8'),'title,place_id\nSaved,saved-id');
 assert.equal(existsSync(path.join(jobDir,'later.csv')),false);assert.equal(get('later-lead'),null);assert.equal(secret('ai'),'saved-secret');
 assert.equal(config('workerControl').paused,true);assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get(queued).status,'interrupted');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);assert.ok(backups().some(b=>b.id===restored.safetyBackup));
 assert.equal(readFileSync(path.join(dataDir,'backups',restored.safetyBackup,'jobs','fixture','later.csv'),'utf8'),'later result');

 const invalid=createBackup(),snapshotPath=path.join(dataDir,'backups',invalid.id,'snapshot.json'),snapshot=JSON.parse(readFileSync(snapshotPath,'utf8'));
 snapshot.tables.users.push({name:'invalid-without-hash'});writeFileSync(snapshotPath,JSON.stringify(snapshot));
 writeFileSync(path.join(dataDir,'backups',invalid.id,'jobs','fixture','results.csv'),'must not overwrite');
 const beforeInvalid=currentState(),backupCount=backups().length;
 assert.throws(()=>restoreBackup(invalid.id),/NOT NULL/);assert.deepEqual(currentState(),beforeInvalid);assert.equal(backups().length,backupCount,'validation precedes safety backup side effects');

 put('lead',{id:'newest-lead',name:'Must survive rollback'});writeFileSync(path.join(jobDir,'results.csv'),'current checkpoint');writeFileSync(path.join(jobDir,'newest.csv'),'current extra file');
 writeFileSync(path.join(dataDir,'secret.key'),Buffer.alloc(32,9));saveSecret('ai','current-secret');
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('current-session','fixture-owner',Date.now()+60000);
 const beforeFailure=currentState(),countBeforeFailure=backups().length,originalExec=db.exec;
 let commits=0;
 db.exec=function(sql){if(sql==='COMMIT'&&++commits===2)throw Error('Injected restore commit failure');return originalExec.call(this,sql);};
 try{assert.throws(()=>restoreBackup(saved.id),/Injected restore commit failure/);}finally{db.exec=originalExec;}
 assert.deepEqual(currentState(),beforeFailure,'database, sessions, key, and exact jobs tree roll back together');
 assert.equal(secret('ai'),'current-secret');assert.equal(backups().length,countBeforeFailure+1,'safety backup survives failed restore');
 const originalRename=fs.renameSync;
 fs.renameSync=function(source,target){if(path.basename(source)==='secret.key'&&path.basename(path.dirname(source)).startsWith('.restore-'))throw Error('Injected key swap failure');return originalRename(source,target);};syncBuiltinESMExports();
 try{assert.throws(()=>restoreBackup(saved.id),/Injected key swap failure/);}finally{fs.renameSync=originalRename;syncBuiltinESMExports();}
 assert.deepEqual(currentState(),beforeFailure,'a filesystem failure after the jobs swap also rolls back every component');
 assert.equal(readdirSync(dataDir).some(name=>name.startsWith('.restore-')),false);
});
