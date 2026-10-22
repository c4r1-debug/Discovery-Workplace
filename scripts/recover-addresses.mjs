import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'csv-parse/sync';
import {addressFields} from '../lib/contact-format.mjs';

const fields=['streetAddress','city','state','postalCode','country'];
const blank=value=>value==null||String(value).trim()==='';
// Keep the same exact identity as dedupeKey without importing the app DB or queuing research.
function key(value){
  const placeId=value.placeId||value.place_id;
  if(placeId)return 'place:'+placeId;
  const name=String(value.title||value.name||'').trim().slice(0,200).toLowerCase();
  return name?`business:${name}:${String(value.address||'').toLowerCase().trim()}`:null;
}
function missing(lead,address){
  return Object.fromEntries(fields.filter(field=>blank(lead[field])&&!blank(address[field])).map(field=>[field,address[field]]));
}

export function recoverAddresses({dataDir=path.resolve(process.env.DISCOVERY_DATA_DIR||'data'),apply=false}={}){
  const db=new DatabaseSync(path.join(dataDir,'discovery.sqlite'),{readOnly:!apply});
  try{
    db.exec('PRAGMA busy_timeout=5000');
    const leads=db.prepare("SELECT id,body FROM records WHERE kind='lead'").all().map(row=>({id:row.id,lead:JSON.parse(row.body)}));
    const byKey=new Map();
    for(const row of leads){const identity=key(row.lead);if(identity){const matches=byKey.get(identity)||[];matches.push(row);byKey.set(identity,matches);}}
    const jobsDir=path.join(dataDir,'jobs');
    const files=existsSync(jobsDir)?readdirSync(jobsDir,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>path.join(jobsDir,entry.name,'results.csv')).filter(existsSync).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs):[];
    const patches=new Map(),matched=new Set();
    const report={mode:apply?'apply':'dry-run',filesScanned:files.length,unreadableFiles:0,sourceRows:0,matchedLeads:0,leadsToUpdate:0,fieldsToFill:0,updatedLeads:0};
    for(const file of files){
      let rows;
      try{rows=parse(readFileSync(file,'utf8'),{columns:true,skip_empty_lines:true,bom:true,relax_column_count:true});}
      catch{report.unreadableFiles++;continue;}
      report.sourceRows+=rows.length;
      for(const raw of rows){
        const matches=byKey.get(key(raw));
        if(!matches)continue;
        const address=addressFields(raw);
        for(const {id,lead} of matches){
          matched.add(id);
          const patch=patches.get(id)||{};
          Object.assign(patch,missing({...lead,...patch},address));
          if(Object.keys(patch).length)patches.set(id,patch);
        }
      }
    }
    report.matchedLeads=matched.size;
    report.leadsToUpdate=patches.size;
    report.fieldsToFill=[...patches.values()].reduce((total,patch)=>total+Object.keys(patch).length,0);
    if(!apply||!patches.size)return report;

    db.exec('BEGIN IMMEDIATE');
    try{
      // Re-read under the write lock so research or manual edits made during scanning are preserved.
      const select=db.prepare("SELECT body FROM records WHERE id=? AND kind='lead'");
      const changes=[];
      for(const [id,address] of patches){
        const row=select.get(id);if(!row)continue;
        const lead=JSON.parse(row.body),patch=missing(lead,address);
        if(Object.keys(patch).length)changes.push({id,lead,patch});
      }
      if(changes.length){
        const backup=path.join(dataDir,`address-recovery-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
        writeFileSync(backup,JSON.stringify(changes.map(change=>change.lead),null,2),{flag:'wx',mode:0o600});
        const update=db.prepare("UPDATE records SET body=? WHERE id=? AND kind='lead'");
        for(const {id,lead,patch} of changes)update.run(JSON.stringify({...lead,...patch}),id);
        report.backup=path.basename(backup);
        report.updatedLeads=changes.length;
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return report;
  }finally{db.close();}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.slice(2).some(arg=>!['--apply','--dry-run'].includes(arg))||(process.argv.includes('--apply')&&process.argv.includes('--dry-run'))){
    console.error('Usage: node scripts/recover-addresses.mjs [--dry-run | --apply]');process.exitCode=1;
  }else{
    try{console.log(JSON.stringify(recoverAddresses({apply:process.argv.includes('--apply')}),null,2));}
    catch(error){console.error(`Address recovery failed (${error.code||error.name}). No lead details were printed.`);process.exitCode=1;}
  }
}
