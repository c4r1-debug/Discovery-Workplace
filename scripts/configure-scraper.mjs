import path from 'node:path';
import {settings,setConfig,enqueue} from '../lib/db.mjs';
import {scraperPath} from '../lib/scraper.mjs';
const file=scraperPath(path.resolve('tools/google-maps-scraper.exe'));
setConfig('settings',{...settings(),gosomMode:'binary',gosomBinary:file});
console.log('Configured Gosom:',file);
if(process.argv.includes('--test-search'))console.log('Validation search:',enqueue('discovery',{keyword:'Dentist',location:'New Jersey, USA',batch:5}));
