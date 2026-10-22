import {getCountries,parsePhoneNumberFromString} from 'libphonenumber-js/max';

const countries=new Set(getCountries());
const names=new Intl.DisplayNames(['en'],{type:'region'});
const countryNames=new Map([...countries].map(code=>[names.of(code).toLowerCase(),code]));
const aliases={usa:'US','u.s.':'US','u.s.a.':'US','united states of america':'US',uk:'GB','u.k.':'GB','great britain':'GB','south korea':'KR'};
const text=value=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
export function countryCode(value){const s=text(value);return countries.has(s.toUpperCase())?s.toUpperCase():aliases[s.toLowerCase()]||countryNames.get(s.toLowerCase())||'';}

export function addressFields(raw){
 let complete=raw.complete_address||raw.mapsData?.complete_address||{};
 if(typeof complete==='string'){try{complete=JSON.parse(complete);}catch{complete={};}}
 if(!complete||typeof complete!=='object'||Array.isArray(complete))complete={};
 const value=(...items)=>items.map(text).find(Boolean)||'';
 const result={streetAddress:value(raw.streetAddress,raw.street_address,raw.street,complete.street),city:value(raw.city,complete.city),state:value(raw.state,complete.state),postalCode:value(raw.postalCode,raw.postal_code,raw.zip,complete.postal_code),country:countryCode(value(raw.country,complete.country))};
 const parts=text(raw.address).split(',').map(s=>s.trim()).filter(Boolean);
 const tailCountry=countryCode(parts.at(-1));
 if(tailCountry){result.country||=tailCountry;parts.pop();}
 // ponytail: parse only unambiguous US/Canadian legacy formats; other regions use Gosom's structured address.
 const region=parts.at(-1)?.match(result.country==='CA'?/^([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i:/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
 if(parts.length>=2&&region&&['US','CA'].includes(result.country)){
  result.state||=region[1].toUpperCase();result.postalCode||=region[2];result.city||=parts.at(-2);if(parts.length>=3)result.streetAddress||=parts.slice(0,-2).join(', ');
 }
 return result;
}

export function phoneForImport(value,country){
 const original=text(value);
 if(!original)return {phone:'',extension:'',review:'No phone recorded'};
 // Do not extract a number from arbitrary text or accept multiple numbers as one.
 if(!/^(?:\+|00)?[\d\s().-]+(?:\s*(?:ext\.?|x|#)\s*\d+)?$/i.test(original))return {phone:'',extension:'',review:'Check original phone'};
 const input=original.startsWith('00')?'+'+original.slice(2):original;
 if(!input.startsWith('+')&&!country)return {phone:'',extension:'',review:'Country needed for national phone'};
 const parsed=parsePhoneNumberFromString(input,{defaultCountry:country||undefined,extract:false});
 if(!parsed?.isValid())return {phone:'',extension:'',review:'Check original phone'};
 return {phone:parsed.number,extension:parsed.ext||'',review:parsed.ext?'Extension exported separately':'Ready'};
}
