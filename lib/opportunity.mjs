// Website-service fit, not purchase intent or a predicted conversion rate.
export function serviceOpportunity(lead){
 if(['Disqualified','Do not contact'].includes(lead.status))return {level:'Not assessed',reason:'Excluded from outreach by your team.',service:''};
 if(!lead.website)return {level:'High',reason:'No website is listed. Verify this before proposing a new website.',service:'Website development'};
 if(lead.websiteBlocked)return {level:'Not assessed',reason:'Website access was blocked; service needs are unknown.',service:''};
 if(typeof lead.score!=='number'||!Number.isFinite(lead.score)||lead.score<0||lead.score>100)return {level:'Not assessed',reason:'Website research has not produced a usable assessment.',service:''};
 const gaps=(lead.findings||[]).filter(f=>f.status==='review');
 const booking=gaps.some(f=>f.id==='booking');
 // ponytail: use the existing observed-gap score; recalibrate thresholds only with reviewed sales outcomes.
 const level=lead.score>=50?'High':lead.score>=25?'Mid':'Low';
 return {level,reason:`${lead.score}/100 observed website-gap score. ${gaps.length?gaps.map(f=>f.title||f.id).join('; '):'No specific gaps recorded.'} Automated findings need review.`,service:booking?'Website improvements; booking / CRM workflow review':level==='Low'?'Website maintenance review':'Website redesign / optimization'};
}
