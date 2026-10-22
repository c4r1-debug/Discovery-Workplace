'use client';
import { useState, useMemo } from 'react';
import LinkedProspects from './linked-prospects';
import {activityPage} from '../lib/activity-query.mjs';
import { Folder, Trash2, Plus, Search } from 'lucide-react';
function LazyFolder({className,summary,children}) { const [open,setOpen]=useState(false); return <details className={className} onToggle={e=>{if(e.target===e.currentTarget)setOpen(e.currentTarget.open);}}><summary>{summary}</summary>{open&&children()}</details>; }
const date = s => new Date(s).toLocaleString();
export function duration(job) { if (!job.startedAt) return job.status === 'queued' ? 'Waiting to start' : 'Duration not recorded'; const end = job.finishedAt || (job.status === 'running' ? new Date().toISOString() : null); if (!end) return 'Duration not recorded'; const seconds = Math.max(0, Math.floor((new Date(end) - new Date(job.startedAt)) / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s${job.status === 'running' ? ' elapsed' : ''}`; }
function Status({ value }) { return <span className={'badge ' + (value === 'completed' ? 'green' : value === 'failed' ? 'red' : 'neutral')}>{value}</span>; }
export default function Activity({ data, action, busy, onNew, onEdit, onLead }) {
    const [selected, setSelected] = useState([]), [undo, setUndo] = useState([]);
    const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[jobPage,setJobPage]=useState(1);
    const history=useMemo(()=>activityPage(data.jobs,search,jobPage),[data.jobs,search,jobPage]);
    const leadById=useMemo(()=>new Map(data.leads.map(l=>[l.id,l])),[data.leads]);
    const campaigns = data.campaigns, ids = selected.filter(id => campaigns.some(c => c.id === id));
    async function remove(ids) { const r = await action({ action: 'deleteSearches', ids }, 'Saved searches deleted. Leads and job history kept.'); if (r) { setUndo(ids); setSelected([]); } }
    function progressLine(j) { const p = j.body.progress; return p && <p className="hint" aria-live="polite">{p.stage} · {p.found || 0} found · {p.collected || 0} collected · {p.new || 0} new · {p.duplicates || 0} duplicates · {p.blocked || 0} blocked · {p.failed || 0} failed{p.areasTotal>0&&<> · {p.areasDone||0}/{p.areasTotal} areas complete · {p.areasRemaining||0} remaining · {p.rate||0} new/min · Last progress: {date(p.lastProgressAt)}</>}</p>; }
    const jobCount=data.jobs.filter(j=>j.type==='discovery'||!j.linked).length;
    function jobRow(j) { return <div className="job" key={j.id}><span className="job-type">{j.type}</span><div className="grow"><strong>{j.leadName || leadById.get(j.body.leadId)?.name || 'Job'}</strong><small>{date(j.created)} · {duration(j)}</small>{progressLine(j)}{j.error && <small>{j.error}</small>}</div><Status value={j.status} />{j.status === 'queued' && <button className="button" onClick={() => action({ action: 'cancel', id: j.id })}>Cancel</button>}</div>; }
    return <><section className="panel padded"><div className="list-heading"><div><h2>Saved searches</h2><p>Automatic batches run while your laptop worker is online.</p></div><button className="button primary" onClick={onNew}><Plus size={16} />New batch automation</button></div>
        <div className="search-selection"><label className="check"><input type="checkbox" aria-label="Select all saved searches" checked={campaigns.length > 0 && ids.length === campaigns.length} onChange={e => setSelected(e.target.checked ? campaigns.map(c => c.id) : [])} />Select all</label><button className="button" disabled={busy || !ids.length} onClick={() => remove(ids)}><Trash2 size={15} />Delete selected ({ids.length})</button>{undo.length > 0 && <button className="button" disabled={busy} onClick={async () => { if (await action({ action: 'restoreSearches', ids: undo }, 'Saved searches restored with scheduling off.')) setUndo([]); }}>Undo deletion</button>}</div>
        {!campaigns.length && <p>No saved searches.</p>}{campaigns.map(c => <div className="campaign" key={c.id}><input type="checkbox" aria-label={`Select ${c.keyword} in ${c.location}`} checked={ids.includes(c.id)} onChange={e => setSelected(e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} /><div className="grow"><strong>{c.keyword} in {c.location}</strong><small>{c.batch === null ? 'All discovered' : `Up to ${c.batch}`} new prospects · Next: {date(c.nextRun)}{c.schedule && ` · Every ${c.schedule.every} ${c.schedule.unit} · ${c.schedule.timezone} · ${c.poolRemaining || 0} collected results waiting`}</small>{c.stopReason && <small>{c.stopReason}</small>}{c.target && <small>{c.totalAdded || 0} / {c.target} new prospects</small>}</div><label className="check"><input type="checkbox" checked={c.enabled} onChange={e => action({ action: 'toggleCampaign', id: c.id, enabled: e.target.checked })} />Schedule {c.enabled ? 'on' : 'off'}</label><button className="button" disabled={busy} onClick={() => action({ action: 'runCampaign', id: c.id }, 'Search queued.')}>Run now</button><button className="button" disabled={busy} onClick={() => onEdit(c)}>Edit</button><button className="icon-button" disabled={busy} aria-label={`Delete ${c.keyword} in ${c.location}`} onClick={() => remove([c.id])}><Trash2 size={17} /></button></div>)}</section>
        <LazyFolder className="panel padded activity-panel" summary={<><h2 className="grow">Job activity</h2><span className="badge neutral">{jobCount} jobs</span></>}>{()=> <>
            <form className="search-selection activity-search" role="search" aria-label="Search job activity" onSubmit={e=>{e.preventDefault();setSearch(query);setJobPage(1);}}>
                <label className="field grow" htmlFor="activity-query">Search job activity<input id="activity-query" type="search" placeholder="Keyword, location, status or job type" value={query} onChange={e=>setQuery(e.target.value)}/></label>
                <button className="button primary" type="submit"><Search size={16} aria-hidden="true"/>Search</button>
                {(query||search)&&<button className="button" type="button" onClick={()=>{setQuery('');setSearch('');setJobPage(1);}}>Clear</button>}
            </form>
            <div className="row wrap"><p className="hint" role="status">{history.total} matching jobs · Showing {history.total?((history.page-1)*10+1):0}–{Math.min(history.page*10,history.total)}</p><button className="button" disabled={busy} onClick={() => action({ action: 'workerControl', paused: !data.workerControl?.paused })}>{data.workerControl?.paused ? 'Resume worker' : 'Stop after current job'}</button></div>
            <p className="muted">Open a search folder to see its prospects. Durations exclude time waiting in the queue.</p>
            {history.jobs.map(job=>job.type==='discovery'?<LazyFolder className="job-folder" key={job.id} summary={<><Folder size={20}/><span className="grow"><strong>{job.body.keyword} · {job.body.location}</strong><small>{date(job.created)} · {job.linkedCount} prospects · {duration(job)}</small></span><Status value={job.status}/></>}>{()=> <>
                {progressLine(job)}
                {['failed','interrupted'].includes(job.status)&&<button className="button" disabled={busy} onClick={()=>action({action:'retryJob',id:job.id},'Search queued to resume from saved results.')}>Resume / retry search</button>}
                {job.body.result&&<p className="hint">{job.body.result.added} new · {job.body.result.duplicates} existing · {job.body.result.remaining} waiting for later batches</p>}
                {job.error&&<p className="muted">{job.error}</p>}
                {job.status==='queued'&&<button className="button" onClick={()=>action({action:'cancel',id:job.id})}>Cancel queued search</button>}
                <LinkedProspects jobId={job.id} version={data} onLead={onLead} action={action} busy={busy}/>
            </>}</LazyFolder>:jobRow(job))}
            {!history.total&&<p>{search?'No jobs match your search.':'No jobs yet.'}</p>}
            {history.pages>1&&<nav className="pagination" aria-label="Job activity pages"><button className="button" disabled={history.page===1} onClick={()=>setJobPage(history.page-1)}>Previous</button><span>Page {history.page} of {history.pages}</span><button className="button" disabled={history.page===history.pages} onClick={()=>setJobPage(history.page+1)}>Next</button></nav>}
        </>}</LazyFolder></>;
}
