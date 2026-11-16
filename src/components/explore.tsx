"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {useResource,ProjectCard,Skeleton,ErrorState,Empty} from './ui';
import {PROJECT_FILTER_DEFAULTS,readProjectFilters,projectFilterParams,type ProjectFilterState,type ProjectFilterOptions,type FilterOption} from '@/lib/project-filters';
import type {Project} from '@/lib/types';
type Page={data:Project[];total:number;page:number;limit:number};
export function Explore(){
 const params=useSearchParams(),urlKey=params.toString(),committed=readProjectFilters(new URLSearchParams(urlKey));
 const [draft,setDraft]=useState<ProjectFilterState>(committed),lastWritten=useRef<string|null>(null);
 const options=useResource<ProjectFilterOptions>('/api/filters/options');
 const projects=useResource<Page>('/api/projects?'+projectFilterParams(committed));
 const write=useCallback((next:ProjectFilterState,replace=false)=>{
  const url=new URL(window.location.href),query=projectFilterParams(next);
  for(const key of Object.keys(PROJECT_FILTER_DEFAULTS)){if(query.has(key))url.searchParams.set(key,query.get(key)!);else url.searchParams.delete(key);}
  lastWritten.current=url.searchParams.toString();
  window.history[replace?'replaceState':'pushState'](null,'',url.pathname+url.search+url.hash);
 },[]);
 useEffect(()=>{if(lastWritten.current===urlKey){lastWritten.current=null;return;}setDraft(readProjectFilters(new URLSearchParams(urlKey)));},[urlKey]);
 useEffect(()=>{if(projectFilterParams(draft).toString()===projectFilterParams(readProjectFilters(new URLSearchParams(urlKey))).toString())return;const timer=setTimeout(()=>write(draft,true),300);return()=>clearTimeout(timer);},[draft,urlKey,write]);
 function choose(key:keyof ProjectFilterState,value:string){const next={...draft,[key]:value,page:'1',...(key==='field'?{domain:''}:{})};setDraft(next);write(next);}
 function page(number:number){const next={...draft,page:String(number)};setDraft(next);write(next);}
 const filterOptions=options.data;
 const domains=draft.field?filterOptions?.domainsByField[draft.field]??[]:filterOptions?.allDomains??[];
 function dropdown(label:string,key:keyof ProjectFilterState,values:FilterOption[]){return <label>{label}<select aria-label={label} disabled={options.loading||!filterOptions} value={draft[key]} onChange={e=>choose(key,e.target.value)}>{values.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label>;}
 return <>
  <div className="page-heading"><h1>Explore projects.</h1><p>Browse ideas from every field. Every open project welcomes your application.</p></div>
  <div className="filter-panel">
   {(['search','skill','role'] as const).map(key=><label key={key}>{key}<input maxLength={key==='skill'?70:100} value={draft[key]} onChange={e=>setDraft(f=>({...f,[key]:e.target.value,page:'1'}))}/></label>)}
   {dropdown('Sort','sort',filterOptions?.sorts??[])}
   {dropdown('Field','field',filterOptions?.fields??[])}
   {dropdown('Domain','domain',domains)}
   {dropdown('Commitment','commitment',filterOptions?.commitments??[])}
   {dropdown('Status','status',filterOptions?.statuses??[])}
   <button className="btn secondary small" type="button" onClick={()=>{const next={...PROJECT_FILTER_DEFAULTS};setDraft(next);write(next);}}>Clear filters</button>
  </div>
  {options.error?<ErrorState message={options.error} retry={options.refresh}/>:options.loading||projects.loading?<Skeleton/>:projects.error?<ErrorState message={projects.error} retry={projects.refresh}/>:projects.data?.data.length?<div className="card-grid">{projects.data.data.map((project,index)=><ProjectCard key={project.id} project={project} index={index}/>)}</div>:<Empty title="No projects match your filters" description="Try another search or clear your filters."/>}
  {!projects.loading&&!projects.error&&projects.data&&projects.data.total>projects.data.limit&&<nav className="form-actions" aria-label="Project pages"><button className="btn secondary" type="button" disabled={projects.data.page<=1} onClick={()=>page(projects.data!.page-1)}>Previous</button><span>Page {projects.data.page} of {Math.ceil(projects.data.total/projects.data.limit)}</span><button className="btn secondary" type="button" disabled={projects.data.page*projects.data.limit>=projects.data.total} onClick={()=>page(projects.data!.page+1)}>Next</button></nav>}
 </>;
}
