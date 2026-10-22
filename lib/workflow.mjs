import db,{get,put,config,list} from './db.mjs';
import {webUrl,email,sameWebsite} from './leads.mjs';

export const defaultCriteria=['Industry and location fit','Reachable contact','Relevant service need','Confirmed interest'];
export function criteria(){return config('qualificationCriteria',defaultCriteria);}
export function qualification(lead){const items=criteria().map(label=>({label,checked:!!lead.qualification?.[label]}));return {items,ready:items.every(i=>i.checked)&&!!(lead.email||lead.phone)&&lead.status==='Interested',missing:items.filter(i=>!i.checked).map(i=>i.label)};}
export function history(leadId){return list('event').filter(e=>!leadId||e.leadId===leadId).slice(0,500);}
export function recordEvent(leadId,user,action,detail){put('event',{id:crypto.randomUUID(),leadId,user,action,detail,at:new Date().toISOString()});}
export function contactEvidence(lead){return {type:lead.contactType||'Unconfirmed',owner:lead.owner||'',email:lead.email||'',source:lead.emailSource||lead.ownerSource||'',checkedAt:lead.contactCheckedAt||lead.checkedAt||null,manual:!!lead.contactManual};}
export function brief(lead){
 const points=[];
 if(lead.websiteBlocked)points.push({observation:'Website could not be checked because access was blocked.',meaning:'Website quality is unknown.',question:'Could you walk us through how customers currently book?',source:lead.mapsUrl});
 else for(const f of (lead.findings||[]).filter(f=>f.status==='review').slice(0,3))points.push({observation:f.detail,meaning:`${f.title} may be worth reviewing; this is an automated observation, not a confirmed business impact.`,question:f.id==='booking'?'How do new customers book an appointment?':f.id==='phone'?'Can mobile visitors contact you as easily as you would like?':'Is improving this part of the website a current priority?',source:f.source});
 if(points.length<3&&lead.rating)points.push({observation:`Google Maps lists ${lead.rating}/5 from ${lead.reviews} reviews.`,meaning:'This gives context for a discussion about online reputation.',question:'How do you currently request and respond to customer reviews?',source:lead.mapsUrl});
 if(points.length<3&&!lead.email)points.push({observation:'No published business email is saved.',meaning:'A suitable contact still needs confirmation.',question:'Who is the best person to speak with about the website?',source:lead.mapsUrl});
 if(!points.length)points.push({observation:'No website findings have been recorded.',meaning:'There is not enough evidence to identify a website issue.',question:'What would you most like your website to improve?',source:lead.mapsUrl});
 return points.slice(0,3);
}
export function updateWorkflow(id,patch,user){
 const lead=get(id,'lead');if(!lead)throw Error('Prospect not found.');
 const changes={};
 if('assignedTo' in patch){const name=String(patch.assignedTo);if(name&&!db.prepare('SELECT name FROM users WHERE name=?').get(name))throw Error('Choose an existing teammate.');changes.assignedTo=name;}
 for(const key of ['service','lastContact','nextAction'])if(key in patch)changes[key]=String(patch[key]).slice(0,2000);
 if('lastContact' in changes&&changes.lastContact&&!Number.isFinite(Date.parse(changes.lastContact)))throw Error('Enter a valid contact date.');
 if('contactType' in patch){if(!['Named owner','Practice inbox','Unconfirmed'].includes(patch.contactType))throw Error('Choose a contact type.');if(patch.contactType==='Named owner'&&(!lead.owner||!webUrl(lead.ownerSource)))throw Error('Save the owner name and source URL first.');if(patch.contactType!==(lead.contactType||'Unconfirmed')){changes.contactType=patch.contactType;changes.contactCheckedAt=new Date().toISOString();changes.contactManual=true;}}
 if('qualification' in patch)changes.qualification=Object.fromEntries(criteria().map(label=>[label,patch.qualification?.[label]===true]));
 Object.assign(lead,changes);put('lead',lead);recordEvent(id,user,'Updated qualification and ownership',changes);return lead;
}
export function applyResearch(lead,result,target=lead){
 if(!sameWebsite(lead,target))throw Error('Website changed during research. Run research for the current website.');
 if(['Do not contact','Disqualified'].includes(lead.status))throw Error('This lead is excluded from outreach.');
 lead.findings=result.findings;lead.score=result.score;lead.ownerCandidates=result.ownerCandidates;lead.checkedAt=result.checkedAt;
 if(!lead.contactManual&&!lead.email&&result.emails.length){lead.email=result.emails.map(email).find(Boolean)||'';lead.emailSource=result.emailSource;lead.contactType='Unconfirmed';lead.contactCheckedAt=result.checkedAt;}
 if(!lead.contactManual&&!lead.phone&&result.phones?.length){lead.phone=result.phones[0];lead.phoneSource=result.phoneSource;}
 if(['New','Missing contact','Ready for review'].includes(lead.status))lead.status=lead.email?'Ready for review':'Missing contact';
 return lead;
}
export function saveReport(target,report){
 put('report',report); // Completed evidence remains historical even if the prospect changed during the audit.
 const latest=get(target.id,'lead');
 if(!sameWebsite(latest,target))throw Error('Website changed during the audit. The report is retained as history.');
 if(['Do not contact','Disqualified'].includes(latest.status)||(!latest.hot&&!latest.requested))throw Error('Prospect is no longer eligible for an audit. The report is retained as history.');
 latest.reportId=report.id;return put('lead',latest);
}
export function handoffPreview(lead){
 const report=lead.reportId?get(lead.reportId,'report'):null;
 const publicUrl=config('settings',{}).publicUrl||'http://localhost:3000';
 return {name:lead.name,description:[`Discovery reference: ${lead.id}`,`Website: ${lead.website}`,`Contact: ${lead.owner||'Owner not confirmed'} (${lead.contactType||'Unconfirmed'})`,`Email: ${lead.email}`,`Phone: ${lead.phone}`,`Address: ${lead.address}`,`Assigned to: ${lead.assignedTo||'Unassigned'}`,`Agreed service: ${lead.service||'Not recorded'}`,`Last contact: ${lead.lastContact||'Not recorded'}`,`Next action: ${lead.nextAction||'Follow up on expressed interest'}`,lead.notes,report?.shareToken?`Report: ${publicUrl}/report/${report.shareToken}`:'',...brief(lead).map(p=>`${p.observation}\nSource: ${p.source||'Workspace record'}`)].filter(Boolean).join('\n\n'),qualification:qualification(lead)};
}
