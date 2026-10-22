export function activityPage(jobs,query='',page=1){
 const term=String(query).trim().toLowerCase();
 const matching=jobs.filter(job=>(job.type==='discovery'||!job.linked)&&[job.type,job.status,job.body.keyword,job.body.location,job.id].filter(Boolean).join(' ').toLowerCase().includes(term));
 const pages=Math.max(1,Math.ceil(matching.length/10)),current=Math.min(pages,Math.max(1,page));
 return {jobs:matching.slice((current-1)*10,current*10),total:matching.length,page:current,pages};
}
