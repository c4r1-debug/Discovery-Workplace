import {load} from 'cheerio';
import {publicFetch} from './network.mjs';
import {email,sameWebsite} from './leads.mjs';
import {get,put} from './db.mjs';
import {websiteBlocked} from './maps-fallback.mjs';
import {findPhoneNumbersInText} from 'libphonenumber-js/max';
import {phoneForImport,countryCode} from './contact-format.mjs';

export function pageEmails(text){
 const $=load(text);$('script,style,noscript').remove();
 const chunks=[];function walk(node){if(node.type==='text')chunks.push(node.data);else for(const child of node.children||[])walk(child);}walk($.root()[0]);
 const content=chunks.join(' ')+' '+$('a[href]').toArray().map(a=>{const href=$(a).attr('href');try{return decodeURIComponent(href);}catch{return href;}}).join(' ');
 return [...new Set((content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)||[]).map(email).filter(Boolean))];
}
export function pagePhones(text,country){
 const $=load(text);$('script,style,noscript').remove();
 const numbers=$('a[href^="tel:"]').toArray().map(a=>{try{return decodeURIComponent($(a).attr('href').slice(4)).replace(/;ext=/i,' ext. ');}catch{return '';}}).map(value=>phoneForImport(value,countryCode(country))).filter(p=>p.phone).map(p=>p.phone+(p.extension?' ext. '+p.extension:''));
 const visible=$.root().find('*').contents().toArray().filter(n=>n.type==='text').map(n=>n.data).join(' ');
 const found=findPhoneNumbersInText(visible,{defaultCountry:countryCode(country)||undefined}).map(({number})=>number.number+(number.ext?' ext. '+number.ext:''));
 return [...new Set([...numbers,...found])];
}
export async function findPublishedEmail(website,fetchPage=publicFetch,initialPage=null,country){
 const home=initialPage||await fetchPage(website);if(home.status>=400)throw Error('Website returned HTTP '+home.status);
 const pages=[home];let emails=pageEmails(home.text),emailSource=home.url;
 if(!emails.length){
  const $=load(home.text),origin=new URL(home.url).origin;
  const links=$('a[href]').toArray().filter(a=>/contact/i.test($(a).attr('href')+' '+$(a).text())).map(a=>{try{const url=new URL($(a).attr('href'),home.url);url.hash='';return url.origin===origin&&url.href!==new URL(home.url).href?url.href:null;}catch{return null;}}).filter(Boolean);
  const urls=[...new Set([...links,new URL('/contact',home.url).href,new URL('/contact-us',home.url).href])].slice(0,3);
  // Alternate routes are tried only when a contact page fails; a usable page ends the lookup.
  for(const url of urls){let page;try{page=await fetchPage(url);}catch{continue;}
   if(page.status>=400||new URL(page.url).origin!==origin)continue;
   pages.push(page);emails=pageEmails(page.text);if(emails.length)emailSource=page.url;break;
  }
 }
 // Phone is secondary: reuse these pages after email lookup, without extra requests.
 for(const page of pages){const phones=pagePhones(page.text,country);if(phones.length)return {emails,emailSource,phones,phoneSource:page.url};}
 return {emails,emailSource,phones:[],phoneSource:''};
}
export async function collectEmails(ids,onProgress=()=>{},find=findPublishedEmail){
 let cursor=0,checked=0,found=0;
 await Promise.all(Array.from({length:Math.min(3,ids.length)},async()=>{
  while(cursor<ids.length){const id=ids[cursor++],target=get(id,'lead');
   if(!target?.website||target.email||target.contactManual||websiteBlocked(target)||['Do not contact','Disqualified'].includes(target.status))continue;
   try{const result=await find(target.website,undefined,null,target.country),lead=get(id,'lead');
    if(!sameWebsite(lead,target)||lead.email||lead.contactManual||['Do not contact','Disqualified'].includes(lead.status))continue;
    lead.emailCheckedAt=new Date().toISOString();delete lead.emailCollectionError;
    if(result.emails.length){lead.email=result.emails[0];lead.emailSource=result.emailSource;lead.contactType='Unconfirmed';lead.contactCheckedAt=lead.emailCheckedAt;if(['New','Missing contact','Ready for review'].includes(lead.status))lead.status='Ready for review';found++;}
    if(!lead.phone&&result.phones?.length){lead.phone=result.phones[0];lead.phoneSource=result.phoneSource;}
    put('lead',lead);
   }catch(e){const lead=get(id,'lead');if(sameWebsite(lead,target)){lead.emailCollectionError=e.message;put('lead',lead);}}
   checked++;onProgress({checked,found});
  }
 }));return {checked,found};
}
