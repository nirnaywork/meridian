"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {api} from './ui';
export function LegacyDomainBanner({id,href}:{id:string;href:string}){
 const [dismissed,setDismissed]=useState(true);const key='meridian-domain-banner:'+id;
 useEffect(()=>{try{setDismissed(localStorage.getItem(key)==='dismissed')}catch{setDismissed(false)}},[key]);
 if(dismissed)return null;return <aside className="info-note" role="status"><p>Add domains to improve your match.</p><Link href={href}>Choose domains</Link>{' '}<button className="text-btn" type="button" onClick={()=>{setDismissed(true);try{localStorage.setItem(key,'dismissed')}catch{}}}>Dismiss</button></aside>;
}
export function DomainSuggestions({skills,value,onConfirm}:{skills:{name:string}[];value:string[];onConfirm:(v:string[])=>void}){
 const [suggestions,setSuggestions]=useState<{name:string;count:number}[]>([]);const [error,setError]=useState('');
 const key=JSON.stringify([...new Set(skills.map(s=>s.name))].sort());
 useEffect(()=>{let live=true;const timer=setTimeout(()=>{api<{name:string;count:number}[]>('/api/data/domain-suggestions?skills='+encodeURIComponent(key)).then(v=>{if(live){setSuggestions(v);setError('')}}).catch(()=>{if(live)setError('Suggestions unavailable. You can still choose domains below.')})},250);return()=>{live=false;clearTimeout(timer)}},[key]);
 const pending=suggestions.filter(s=>!value.includes(s.name));
 return <div className="info-note"><p>Suggested from skill-to-domain links. You choose what is saved.</p>{error&&<p>{error}</p>}{pending.length?<><p>{pending.map(s=>`${s.name} (${s.count} skills)`).join(' · ')}</p><button type="button" className="btn secondary small" onClick={()=>onConfirm([...new Set([...value,...pending.map(s=>s.name)])].slice(0,20))}>Confirm suggested domains</button></>:<p>No additional domain suggestions.</p>}</div>;
}
