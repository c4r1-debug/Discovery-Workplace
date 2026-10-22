import {addressFields,phoneForImport} from './contact-format.mjs';
import {serviceOpportunity} from './opportunity.mjs';

export function csvCell(value,phone=false){let text=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);if(!(phone&&/^\+[1-9]\d{6,14}$/.test(text))&&(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
const importColumns=['Business Name','Industry','Name','Email','Phone','Address','City','State','Postal Code','Country','Website','Opportunity Level','Opportunity Reason','Suggested Service','Original Phone','Phone Extension','Phone Review','Full Address'];
export function prospectsCSV(leads,reports=[],format='complete'){
 const rows=leads.map(l=>{
  const a=addressFields(l),p=phoneForImport(l.phone,a.country),o=serviceOpportunity(l);
  const {name,owner,email,phone,address,website,streetAddress,city,state,postalCode,country,...details}=l;
  return {...(format==='complete'?details:{}),'Business Name':name,'Industry':l.category||'','Name':owner||'','Email':email,'Phone':p.phone,'Address':a.streetAddress,'City':a.city,'State':a.state,'Postal Code':a.postalCode,'Country':a.country,'Website':website,'Opportunity Level':o.level==='Not assessed'?'':o.level,'Opportunity Reason':o.reason,'Suggested Service':o.service,'Original Phone':phone,'Phone Extension':p.extension,'Phone Review':p.review,'Full Address':address,...(format==='complete'?{reports:reports.filter(r=>r.leadId===l.id)}:{})};
 });
 const columns=[...new Set([...importColumns,...rows.flatMap(Object.keys)])];
 return '\uFEFF'+[columns.map(k=>csvCell(k)).join(','),...rows.map(row=>columns.map(k=>csvCell(row[k],k==='Phone')).join(','))].join('\r\n');
}
