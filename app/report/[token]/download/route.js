import {list,settings} from '../../../../lib/db.mjs';
import {userFrom} from '../../../../lib/auth.mjs';
import {reportDocx} from '../../../../lib/report-docx.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req,{params}){
 const {token}=await params,user=userFrom(req);
 const report=list('report').find(r=>r.shareToken===token||(user&&r.id===token));
 if(!report)return new Response('Report not found',{status:404,headers:{'Cache-Control':'no-store'}});
 const filename=(report.business||'Website').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,80)||'Website';
 return new Response(new Uint8Array(await reportDocx(report,settings())),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':`attachment; filename="${filename}-audit.docx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
