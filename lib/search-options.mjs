export function batchLimit(value){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw Error('Enter a positive whole number or leave the limit blank.');return n;}
export function previewKey(keyword,location){return [keyword,location].map(v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ')).join('|');}
