import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {scraperPath} from '../lib/scraper.mjs';
test('scraper paths reject folders, missing files and blank input; spaces and quotes work',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'discovery-scraper-'));
  assert.throws(()=>scraperPath(dir),/folder/);
  assert.throws(()=>scraperPath(''),/not configured/);
  assert.throws(()=>scraperPath(path.join(dir,'missing.exe')),/not found/);
  const exe=path.join(dir,'google maps scraper.exe');writeFileSync(exe,'test fixture, never executed');
  assert.equal(scraperPath('"'+exe+'"'),exe);
});
