import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import {list,settings} from '../../../lib/db.mjs';
import {userFrom} from '../../../lib/auth.mjs';
import {reportContent,devices,scoreLabel} from '../../../lib/report-content.mjs';
import PrintButton from './print.jsx';
export const dynamic='force-dynamic';
export default async function Report({params}){
 const {token}=await params,user=userFrom({cookies:await cookies()});
 const r=list('report').find(r=>r.shareToken===token||(user&&r.id===token));if(!r)notFound();
 const s=settings(),agency=r.agency||s.agency,c=reportContent(r);
 return <article className="report owner-report">
 <header className="report-brand"><div><div className="eyebrow">WEBSITE OPPORTUNITY REPORT</div><h2>{agency}</h2></div><div className="report-actions no-print"><PrintButton/><a className="button primary" href={'/report/'+token+'/download'}>Download Word (.docx)</a></div></header>
 {!r.shareToken&&<p className="draft-label">Draft — Not approved for sharing</p>}
 <section className="report-title"><h1>{r.business}</h1><p>{r.website} · Checked {new Date(r.createdAt).toLocaleDateString('en-US',{dateStyle:'long'})}</p><p className="hint no-print">Word downloads are editable. Upload the .docx to Google Drive to open it in Google Docs.</p></section>
 <section className="owner-summary"><div className="eyebrow">YOUR WEBSITE AT A GLANCE</div><h2>What this means for your business</h2>{c.summary.map((p,i)=><p key={i}>{p}</p>)}</section>
 <section className="priority-grid">{c.priorities.map((p,i)=><div className={'priority-card priority-'+i} key={p.label}><span className="eyebrow">{p.label}</span><h3>{p.title}</h3><p>{p.detail}</p><small>Evidence: <a href={r.website}>Audited page</a></small></div>)}</section>
 <section className="panel padded"><h2>The page we tested</h2><div className="report-screens">{devices.map(d=>r[d]?.screenshot?<figure key={d}><figcaption>{d==='mobile'?'Mobile':'Desktop'}</figcaption><img src={r[d].screenshot} alt={d+' screenshot of '+r.business}/></figure>:<p key={d}>{d}: screenshot unavailable</p>)}</div><p className="hint">Captured during the audit. Screenshots provide context; no visual defects have been manually confirmed.</p></section>
 <section className="panel padded"><h2>Mobile and desktop comparison</h2><p>Scores are out of 100, not percentages of customers, bookings or legal compliance.</p><div className="report-table-wrap"><table className="owner-table"><thead><tr><th>Check and interpretation</th><th>Mobile</th><th>Desktop</th></tr></thead><tbody>{c.scores.map(row=><tr key={row.id}><th>{row.title}<small>{row.meaning}</small></th>{devices.map(d=><td key={d}><strong className={'score-value '+(row[d]==null?'unknown':row[d]<50?'poor':row[d]<90?'moderate':'good')}>{row[d]??'—'}</strong><small>{scoreLabel(row[d])}</small></td>)}</tr>)}</tbody></table></div></section>
 <section className="panel padded"><h2>Loading experience in plain language</h2><div className="report-table-wrap"><table className="owner-table"><thead><tr><th>Measurement</th><th>Mobile</th><th>Desktop</th></tr></thead><tbody>{c.metrics.map(m=><tr key={m.id}><th>{m.title}<small>{m.meaning}</small></th><td>{m.mobile}</td><td>{m.desktop}</td></tr>)}</tbody></table></div></section>
 <section className="panel padded"><h2>Contact and content checks</h2>{c.basics.map(f=><div className="finding" key={f.id}><span className={'badge '+(f.status==='pass'?'green':'amber')}>{f.status==='pass'?'Detected':'Review'}</span><strong>{f.title}</strong><p>{f.detail}</p>{f.source&&<small>Source: <a href={f.source}>{f.source}</a></small>}</div>)}<p className="hint">Detected HTML does not prove visibility or successful booking. Manually check phone links and the appointment journey.</p></section>
 <section className="report-appendix"><h2>Technical appendix</h2><p>Supporting evidence for your website developer.</p>{devices.map(d=><details className="panel padded" key={d}><summary>{d==='mobile'?'Mobile':'Desktop'} technical findings</summary><div className="technical-content">{c.technical.filter(f=>f.device===d).map(f=><div className="finding" key={f.id}><strong>{f.title}</strong><p>{f.detail}</p><small>{f.displayValue}</small></div>)}</div></details>)}</section>
 <section className="report-scope"><h3>Scope and interpretation</h3><p>{c.scope}</p><a href="https://developer.chrome.com/docs/lighthouse/performance/performance-scoring">How Lighthouse scores work</a></section>
 <footer className="report-brand"><div><h2>Agree on the next step</h2><p>Review the priorities together, choose the changes, and retest.</p></div>{(r.bookingUrl||s.bookingUrl)&&<a className="button primary" href={r.bookingUrl||s.bookingUrl}>Discuss your website</a>}{(r.contactEmail||s.contactEmail)&&<a href={'mailto:'+(r.contactEmail||s.contactEmail)}>Contact {agency}</a>}</footer>
 </article>;
}

