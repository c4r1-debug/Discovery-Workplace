import test from 'node:test';
import assert from 'node:assert/strict';
import {reportContent,scoreLabel} from '../lib/report-content.mjs';
import {reportDocx} from '../lib/report-docx.mjs';
test('owner interpretations prioritize performance and reconcile HTTPS without altering source data',async()=>{
 const report={business:'Example Dental',website:'https://example.org',createdAt:'2026-09-20',findings:[{id:'https',status:'pass',detail:'HTTPS detected'},{id:'heading',status:'review',detail:'2 H1 headings'},{id:'description',status:'review',detail:'Missing description'}],mobile:{categories:[{id:'performance',score:37},{id:'accessibility',score:98}],metrics:[{id:'largest-contentful-paint',value:'14.7 s'}],findings:[{id:'is-on-https',title:'Does not use HTTPS',detail:'Insecure resource',displayValue:'1 request'}]}};
 const c=reportContent(report);assert.equal(c.priorities[0].title,'Investigate loading delays');assert.match(c.basics[0].title,/insecure/);assert.equal(report.findings[0].status,'pass');assert.match(c.basics[1].detail,/alone do not/);assert.equal(scoreLabel(null),'Not assessed');assert.equal(scoreLabel(37),'Needs attention');assert.equal(scoreLabel(98),'Good automated result');
 assert.ok(!reportContent({}).summary.join(' ').includes('after Not available'));
 const bytes=await reportDocx(report);assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.length>5000);
});
