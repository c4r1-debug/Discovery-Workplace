'use client';
import {useEffect,useState} from 'react';

export default function RegionAreas({location,selectedAreas,manualAreas='',onChange}){
 const [directory,setDirectory]=useState(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setDirectory(null);setError('');
  const timer=setTimeout(async()=>{try{const response=await fetch('/api/locations?region='+encodeURIComponent(location),{signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Area list unavailable.');setDirectory(data);}catch(e){if(e.name!=='AbortError')setError(e.message);}},200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[location]);
 const selected=selectedAreas??directory?.areas.map(a=>a.id)??[];
 return <fieldset><legend>Review search areas</legend>
  {error?<p role="status">{error}</p>:!directory?<p role="status">Loading the region’s areas…</p>:<>
   <p className="hint">{directory.version}. {directory.areas.length} listed cities; {selected.length} selected. Smaller towns may be missing.</p>
   <div className="row wrap"><button className="button" type="button" onClick={()=>onChange({selectedAreas:null})}>Select all listed</button><button className="button" type="button" onClick={()=>onChange({selectedAreas:[]})}>Clear selection</button></div>
   <details open={directory.areas.length<=15}><summary>View {directory.areas.length} listed areas</summary><div style={{maxHeight:240,overflowY:'auto'}}>{directory.areas.map(area=><label className="check" key={area.id}><input type="checkbox" checked={selected.includes(area.id)} onChange={e=>onChange({selectedAreas:e.target.checked?[...selected,area.id]:selected.filter(id=>id!==area.id)})}/>{area.label}</label>)}</div></details>
  </>}
  <label className="field">Add missing towns (one per line)<textarea rows={3} maxLength={50000} value={manualAreas} placeholder="Example town" onChange={e=>onChange({manualAreas:e.target.value})}/></label>
  <p className="hint">Town names without commas use the selected region and country. For other names, enter the full location. The prospect limit can stop a run before all selected areas are searched; this list does not guarantee complete coverage.</p>
 </fieldset>;
}
