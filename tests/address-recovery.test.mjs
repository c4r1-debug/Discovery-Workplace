import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {recoverAddresses} from '../scripts/recover-addresses.mjs';

test('address recovery previews without writing, backs up affected leads, and only fills missing fields',()=>{
  const dataDir=mkdtempSync(path.join(tmpdir(),'discovery-address-recovery-'));
  const db=new DatabaseSync(path.join(dataDir,'discovery.sqlite'));
  db.exec('CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT,body TEXT); CREATE TABLE jobs(id TEXT PRIMARY KEY,body TEXT);');
  const original={id:'one',name:'Old Name',placeId:'place-one',address:'Full address',city:'Manually checked city',email:'verified@example.com',contactManual:true,findings:[{title:'Existing research'}]};
  const fallback={id:'two',name:'Fallback Practice',address:'  Second Street  ',postalCode:'00123',notes:'Keep notes'};
  const untouched={id:'three',name:'Other Practice',placeId:'unmatched'};
  const put=db.prepare('INSERT INTO records VALUES(?,?,?)');
  for(const lead of [original,fallback,untouched])put.run(lead.id,'lead',JSON.stringify(lead));
  db.prepare('INSERT INTO jobs VALUES(?,?)').run('existing-job','{}');
  const jobDir=path.join(dataDir,'jobs','first');mkdirSync(jobDir,{recursive:true});
  const address={street:'123 Main St',city:'Source city',state:'New Jersey',postal_code:'07001',country:'US'};
  const csv=[['title','place_id','address','complete_address'],['Renamed practice','place-one','Different address',JSON.stringify(address)],['fallback practice','','second street',JSON.stringify({...address,street:'Second Street',postal_code:'99999'})]];
  writeFileSync(path.join(jobDir,'results.csv'),csv.map(row=>row.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(',')).join('\n'));
  const get=id=>JSON.parse(db.prepare('SELECT body FROM records WHERE id=?').get(id).body);
  try{
    const preview=recoverAddresses({dataDir});
    assert.equal(preview.mode,'dry-run');assert.equal(preview.leadsToUpdate,2);assert.equal(preview.updatedLeads,0);
    assert.deepEqual(get('one'),original);assert.deepEqual(get('two'),fallback);
    assert.equal(readdirSync(dataDir).some(file=>file.startsWith('address-recovery-backup-')),false);
    const applied=recoverAddresses({dataDir,apply:true});assert.equal(applied.updatedLeads,2);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dataDir,applied.backup),'utf8')),[original,fallback]);
    assert.equal(get('one').streetAddress,'123 Main St');assert.equal(get('one').postalCode,'07001');assert.equal(get('one').city,original.city);
    assert.equal(get('one').email,original.email);assert.deepEqual(get('one').findings,original.findings);assert.equal(get('one').contactManual,true);
    assert.equal(get('two').postalCode,'00123');assert.equal(get('two').notes,'Keep notes');assert.equal(get('two').streetAddress,'Second Street');
    assert.deepEqual(get('three'),untouched);assert.equal(db.prepare('SELECT count(*) AS count FROM jobs').get().count,1);
    assert.equal(recoverAddresses({dataDir,apply:true}).updatedLeads,0);
  }finally{db.close();}
});
