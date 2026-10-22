'use client';
import {useEffect,useState} from 'react';
export function ImportReview({rows,onLead}){return rows?.length?<details><summary>{rows.length} import rows need review</summary><p>These rows were skipped because their identity is uncertain. Review the existing prospects before importing corrected rows with a place ID or full address.</p>{rows.map((row,i)=><div className="finding" key={i}><strong>{row.name}</strong><p>{row.address||'Address missing'}</p>{row.candidateIds.map((id,n)=><button type="button" className="button" key={id} onClick={()=>onLead(id)}>Review candidate {n+1}</button>)}</div>)}</details>:null;}
export default function LinkedProspects({jobId,campaignIds,version,onLead,action,busy}){
 const [page,setPage]=useState(1),[result,setResult]=useState(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setError('');
  const params=new URLSearchParams({page:String(page),...(jobId?{jobId}:{campaignIds})});
  fetch('/api/workspace?'+params,{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(!controller.signal.aborted)setResult(data);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>controller.abort();
 },[jobId,campaignIds,page,version]);
 if(error)return <p role="alert">{error}</p>;
 if(!result)return <p role="status">Loading linked prospects…</p>;
 return <div>{result.job?.body.collection?.states?.length>1&&<details><summary>Area progress</summary>{result.job.body.collection.states.map((s,i)=><p key={s.id||s.location||i}>{s.location} · {s.status}{s.error&&' · '+s.error}</p>)}</details>}
 <p className="hint">{result.total} linked prospects</p>
 <ImportReview rows={result.job?.body.result?.needsReview} onLead={onLead}/>
 {result.leads.map(lead=><details className="folder-lead" key={lead.id}><summary><span className="grow">{lead.name}<small>{lead.status}</small></span><button className="button" onClick={e=>{e.preventDefault();onLead(lead.id);}}>Review</button></summary>{result.leadJobs.filter(j=>j.body.leadId===lead.id).map(j=><div className="job" key={j.id}><span>{j.type} · {j.status}<small>{new Date(j.created).toLocaleString()}{j.error&&' · '+j.error}</small></span>{j.status==='queued'&&action&&<button className="button" disabled={busy} onClick={()=>action({action:'cancel',id:j.id})}>Cancel</button>}</div>)}</details>)}
 {result.pages>1&&<div className="pagination"><button className="button" disabled={result.page===1} onClick={()=>setPage(result.page-1)}>Previous</button><span>Page {result.page} of {result.pages}</span><button className="button" disabled={result.page===result.pages} onClick={()=>setPage(result.page+1)}>Next</button></div>}
 </div>;
}
