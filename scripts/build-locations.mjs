import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const rows=file=>readFileSync('data/geonames/'+file,'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split('\t'));
const countries=new Map(rows('countries.txt').map(r=>[r[0],r[4]]));const admin=new Map(rows('admin1.txt').map(r=>[r[0],r[1]]));
const result=[...countries].map(([code,name])=>({id:'country:'+code,countryCode:code,label:name,type:'Country',search:name+' '+code,population:1e12}));
for(const [code,name] of admin)result.push({id:'region:'+code,countryCode:code.split('.')[0],adminCode:code,label:name+', '+(countries.get(code.split('.')[0])||code.split('.')[0]),type:'Region',search:name,population:1e11});
for(const r of rows('cities15000.txt'))result.push({id:'geonames:'+r[0],countryCode:r[8],adminCode:r[8]+'.'+r[10],label:[r[1],admin.get(r[8]+'.'+r[10]),countries.get(r[8])].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', '),type:'City',search:r[1]+' '+r[2],lat:Number(r[4]),lng:Number(r[5]),population:Number(r[14])||0});
mkdirSync('resources',{recursive:true});writeFileSync('resources/locations.json',JSON.stringify(result));console.log('Local locations:',result.length);
