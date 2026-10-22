'use client';
import {useEffect,useRef} from 'react';
export default function Dialog({children,onClose,className,label}){
 const ref=useRef(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement;dialog.showModal();return()=>{dialog.close();previous?.focus?.();};},[]);
 return <dialog ref={ref} className={className} aria-label={label} onCancel={e=>{e.preventDefault();close.current();}} onClick={e=>{if(e.target===e.currentTarget){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close.current();}}}>{children}</dialog>;
}
