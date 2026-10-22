import {statSync} from 'node:fs';
import path from 'node:path';

export function scraperPath(value){
  const file=String(value||'').trim().replace(/^"(.*)"$/,'$1');
  if(!file)throw Error('Gosom is not configured. Install the scraper and select its executable file in Settings, or use Docker.');
  if(!path.isAbsolute(file))throw Error('Enter the full path to the Gosom executable file.');
  let stat;try{stat=statSync(file);}catch{throw Error('The Gosom executable was not found. Check its full file path in Settings.');}
  if(stat.isDirectory())throw Error('The Gosom path points to a folder. Select the scraper executable inside it (for example google-maps-scraper.exe), not an output folder.');
  if(!stat.isFile())throw Error('The Gosom path must point to an executable file.');
  if(process.platform==='win32'&&path.extname(file).toLowerCase()!=='.exe')throw Error('Select the Windows Gosom .exe file, not a ZIP archive or source-code file.');
  return file;
}
export function validateScraper(settings){if(settings.gosomMode!=='docker')return scraperPath(settings.gosomBinary);return null;}
