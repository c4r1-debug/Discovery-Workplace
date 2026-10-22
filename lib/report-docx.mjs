import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,HeadingLevel,WidthType,ImageRun,Footer,PageNumber} from 'docx';
import {reportContent,devices,scoreLabel} from './report-content.mjs';
const p=(text,options={})=>new Paragraph({children:[new TextRun(String(text||''))],spacing:{after:160},...options});
const heading=(text,level=HeadingLevel.HEADING_1)=>p(text,{heading:level,keepNext:true});
function table(rows){return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.map((cells,i)=>new TableRow({tableHeader:i===0,cantSplit:true,children:cells.map(text=>new TableCell({shading:i===0?{fill:'E8F2EE'}:undefined,children:[p(text)]}))}))});}
function screenshot(data,device){
 const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(data||'');if(!match)return null;
 const bytes=Buffer.from(match[2],'base64');let w,h;
 if(match[1]==='png'&&bytes.length>24){w=bytes.readUInt32BE(16);h=bytes.readUInt32BE(20);}
 else for(let i=2;i+9<bytes.length;){if(bytes[i]!==255)break;const marker=bytes[i+1],len=bytes.readUInt16BE(i+2);if([192,193,194].includes(marker)){h=bytes.readUInt16BE(i+5);w=bytes.readUInt16BE(i+7);break;}if(len<2)break;i+=2+len;}
 if(!w||!h)return null;const scale=Math.min((device==='mobile'?200:580)/w,360/h);
 return new Paragraph({children:[new ImageRun({data:bytes,type:match[1]==='jpeg'?'jpg':'png',transformation:{width:Math.round(w*scale),height:Math.round(h*scale)},altText:{title:device+' website screenshot',description:'Page captured during the audit',name:device}})],spacing:{after:180}});
}
export async function reportDocx(r,settings={}){
 const c=reportContent(r),agency=r.agency||settings.agency||'Discovery Workspace',children=[p(r.business+' website audit',{heading:HeadingLevel.TITLE}),p(agency),p(r.website+' · Checked '+new Date(r.createdAt).toLocaleDateString('en-US',{dateStyle:'long'}))];
 if(!r.shareToken)children.push(p('Draft — Not approved for sharing',{style:'Strong'}));
 children.push(heading('What this means for your business'),...c.summary.map(t=>p(t)),heading('Recommended priorities'));
 for(const item of c.priorities)children.push(heading(item.label+' — '+item.title,HeadingLevel.HEADING_2),p(item.detail),p('Evidence: '+r.website));
 children.push(heading('The page we tested'));
 for(const d of devices){children.push(heading(d==='mobile'?'Mobile':'Desktop',HeadingLevel.HEADING_2));const img=screenshot(r[d]?.screenshot,d);children.push(img||p('Screenshot unavailable.'));}
 children.push(p('Captured during the audit. Screenshots provide context; no visual defects have been manually confirmed.'),heading('Mobile and desktop comparison'),p('Scores are out of 100, not percentages of customers, bookings or legal compliance.'),table([['Check and interpretation','Mobile','Desktop'],...c.scores.map(s=>[s.title+'\n'+s.meaning,...devices.map(d=>(s[d]??'—')+' — '+scoreLabel(s[d]))])]),heading('Loading experience in plain language'),table([['Measurement','Mobile','Desktop'],...c.metrics.map(m=>[m.title+'\n'+m.meaning,m.mobile,m.desktop])]),heading('Contact and content checks'));
 for(const f of c.basics)children.push(heading(f.title,HeadingLevel.HEADING_2),p((f.status==='pass'?'Detected':'Review')+' — '+f.detail),p('Source: '+(f.source||r.website)));
 children.push(p('Detected HTML does not prove visibility or successful booking. Manually check phone links and the appointment journey.'),heading('Technical appendix'));
 for(const d of devices){children.push(heading(d==='mobile'?'Mobile findings':'Desktop findings',HeadingLevel.HEADING_2));for(const f of c.technical.filter(f=>f.device===d))children.push(p(f.title,{keepNext:true}),p(f.detail),p(f.displayValue));}
 children.push(heading('Scope and interpretation'),p(c.scope),p('Scoring reference: https://developer.chrome.com/docs/lighthouse/performance/performance-scoring'),heading('Agree on the next step'),p('Review the priorities together, choose the changes, and retest.'),p(r.contactEmail||settings.contactEmail),p(r.bookingUrl||settings.bookingUrl));
 return Packer.toBuffer(new Document({creator:agency,title:r.business+' website audit',styles:{default:{document:{run:{font:'Calibri',size:22},paragraph:{spacing:{line:276}}}}},sections:[{properties:{page:{margin:{top:900,bottom:900,left:900,right:900}}},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun((r.shareToken?'':'Draft — Not approved for sharing · ')),new TextRun({children:['Page ',PageNumber.CURRENT]})]})]})},children}]}));
}
