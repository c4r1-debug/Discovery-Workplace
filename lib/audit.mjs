import {load} from 'cheerio';
import {publicFetch} from './network.mjs';
import {findPublishedEmail} from './email-collection.mjs';
export async function inspectWebsite(lead){if(!lead.website)throw Error('This prospect has no website. Add one before running research.');const page=await publicFetch(lead.website);if(page.status>=400)throw Error('Website returned HTTP '+page.status);const $=load(page.text);$('script,style,noscript').remove();const findings=[];
const add=(id,title,pass,detail)=>findings.push({id,title,status:pass?'pass':'review',detail,source:page.url});
add('title','Descriptive page title',!!$('title').text().trim(),$('title').text().trim()||'No page title found.');
add('description','Search description',!!$('meta[name="description"]').attr('content'),$('meta[name="description"]').attr('content')||'No meta description found.');
add('heading','Main page heading',$('h1').length===1,`${$('h1').length} H1 headings found in the downloaded HTML.`);
add('phone','Clickable phone number',$('a[href^="tel:"]').length>0,'Check whether a visitor can call directly from the page.');
const booking=$('a,button').toArray().some(e=>/book|appointment|schedule/i.test($(e).text()));
add('booking','Booking or appointment action',booking,booking?'A booking-related label is present. Manually confirm visibility and destination.':'No booking-related link/button label found in the downloaded HTML.');
add('viewport','Mobile viewport declaration',!!$('meta[name="viewport"]').length,'A viewport declaration helps mobile layout; it does not prove usability.');
add('https','HTTPS connection',page.url.startsWith('https:'),'Checked the final page URL.');
const names=[];const structured=load(page.text);structured('script[type="application/ld+json"]').each((_,el)=>{try{const walk=o=>{if(!o||typeof o!=='object')return;if((o['@type']==='Person'||o['@type']==='Dentist')&&typeof o.name==='string'&&/owner|founder/i.test(String(o.jobTitle||'')))names.push({name:o.name,role:o.jobTitle,source:page.url});Object.values(o).forEach(v=>Array.isArray(v)?v.forEach(walk):typeof v==='object'&&walk(v));};walk(JSON.parse(structured(el).text()));}catch{}});
const {emails,emailSource,phones,phoneSource}=await findPublishedEmail(lead.website,publicFetch,page,lead.country);
return {findings,emails,phones,phoneSource,ownerCandidates:names,emailSource,checkedAt:new Date().toISOString(),score:Math.round(findings.filter(f=>f.status==='review').length/findings.length*100)};
}
export function summarizeLighthouse(result,device){return {device,categories:Object.values(result.categories||{}).map(c=>({id:c.id,title:c.title,score:c.score===null?null:Math.round(c.score*100)})),metrics:['largest-contentful-paint','cumulative-layout-shift','total-blocking-time','first-contentful-paint'].map(id=>({id,title:result.audits[id]?.title,value:result.audits[id]?.displayValue||'Not available'})),findings:Object.values(result.audits).filter(a=>a.score!==null&&a.score<0.9&&a.scoreDisplayMode!=='manual'&&a.scoreDisplayMode!=='informative').slice(0,20).map(a=>({id:a.id,title:a.title,detail:a.description,displayValue:a.displayValue||''})),screenshot:result.audits['final-screenshot']?.details?.data||null};}
