import {NextResponse} from 'next/server';
import {userFrom} from '../../../lib/auth.mjs';
import {findLocations,regionDirectory} from '../../../lib/locations.mjs';
export async function GET(req){
 if(!userFrom(req))return NextResponse.json({error:'Sign in required'},{status:401});
 try{const params=new URL(req.url).searchParams;return NextResponse.json(params.has('region')?regionDirectory(params.get('region')):findLocations(params.get('q')?.slice(0,150)||''));}
 catch(e){return NextResponse.json({error:e.message},{status:400});}
}
