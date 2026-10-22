'use client';
import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {THEME_STORAGE_KEY} from '../lib/theme.mjs';

export default function ThemeToggle(){
 const [theme,setTheme]=useState('dark');
 useEffect(()=>{
  setTheme(document.documentElement.dataset.theme==='light'?'light':'dark');
  function sync(event){
   if(event.key!==THEME_STORAGE_KEY&&event.key!==null)return;
   const next=event.newValue==='light'?'light':'dark';
   document.documentElement.dataset.theme=next;setTheme(next);
  }
  window.addEventListener('storage',sync);
  return ()=>window.removeEventListener('storage',sync);
 },[]);
 function toggle(){
  const next=document.documentElement.dataset.theme==='light'?'dark':'light';
  document.documentElement.dataset.theme=next;setTheme(next);
  try{localStorage.setItem(THEME_STORAGE_KEY,next);}catch{}
 }
 const label=`Switch to ${theme==='dark'?'light':'dark'} theme`;
 return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} onClick={toggle}>{theme==='dark'?<Sun size={18} aria-hidden="true"/>:<Moon size={18} aria-hidden="true"/>}</button>;
}
