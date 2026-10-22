import locations from '../resources/locations.json' with {type:'json'};
const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const indexed=locations.map(l=>({...l,text:normalize(l.label+' '+l.search)}));
export const directoryVersion='GeoNames cities15000 · 2026-09-20';
export function regionDirectory(value){
 const q=normalize(value).trim().replace(/,\s*(usa|us|u\.s\.a\.)$/,' , united states').replace(/\s*,\s*/g,', ');
 const regions=locations.filter(l=>l.type==='Region'&&(l.id===value||normalize(l.label)===q||normalize(l.label.split(',')[0])===q));
 if(regions.length!==1)throw Error('Choose a state / region from location suggestions, including its country.');
 const region=regions[0];const areas=locations.filter(l=>l.type==='City'&&l.adminCode===region.adminCode).sort((a,b)=>b.population-a.population).map(({id,label})=>({id,label}));
 return {region:{id:region.id,label:region.label},version:directoryVersion,areas};
}
export function regionAreas(value){return regionDirectory(value).areas.map(a=>a.label);}
export function areaIdentity(area){return typeof area==='object'&&area.id?area.id:'legacy:'+normalize(typeof area==='string'?area:area.location||area.label).trim();}
export function selectedRegionAreas(location,selectedAreas,manualAreas=''){
 const directory=regionDirectory(location);
 if(selectedAreas!=null&&(!Array.isArray(selectedAreas)||selectedAreas.some(id=>typeof id!=='string'||!directory.areas.some(a=>a.id===id))))throw Error('Choose valid areas from this region.');
 if(typeof manualAreas!=='string'||manualAreas.length>50000)throw Error('Enter missing areas as text, one per line.');
 const manual=manualAreas.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 if(manual.length>200||manual.some(v=>v.length>200))throw Error('Use at most 200 manual areas, each under 200 characters.');
 const areas=directory.areas.filter(a=>selectedAreas==null||selectedAreas.includes(a.id));
 for(const name of manual){const label=name.includes(',')?name:name+', '+directory.region.label;
  if(!areas.some(a=>normalize(a.label)===normalize(label)))areas.push({id:'manual:'+directory.region.id+':'+normalize(label),label});
 }
 if(!areas.length)throw Error('Select at least one area or add a missing town.');
 return {areas,selectedAreas:selectedAreas??null,manualAreas,regionId:directory.region.id,directoryVersion:directory.version};
}
export function findLocations(query){const q=normalize(query).trim();if(q.length<2)return [];const terms=q.split(/[ ,]+/);return indexed.filter(l=>terms.every(t=>l.text.includes(t))).sort((a,b)=>Number(normalize(b.label).startsWith(q))-Number(normalize(a.label).startsWith(q))||b.population-a.population).slice(0,10).map(({id,label,type,lat,lng})=>({id,label,type,lat,lng}));}
