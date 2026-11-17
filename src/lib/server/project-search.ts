import 'server-only';
import {projectStatuses,statusLabel} from '../collaboration';
import {checked,type session} from './db';
import {projectSearchSchema,type ProjectFilterOptions} from '../project-filters';
import {attachRoleMatches} from './role-matches';
import {presentExploreProject} from './match-presentation';
type Db=Awaited<ReturnType<typeof session>>['db'];
export async function projectSearchPage(db:Db,userId:string,url:string){
 const {page,limit,...filters}=projectSearchSchema.parse(Object.fromEntries(new URL(url).searchParams));
 const result=checked(await db.database.rpc('search_projects',{p_filters:filters,p_page:page,p_limit:limit})) as any;
 return {data:await attachRoleMatches(db,userId,result.data.map(presentExploreProject)),total:Number(result.total),page:result.page,limit:result.limit};
}
export async function projectFilterOptions(db:Db):Promise<ProjectFilterOptions>{
 const results=await Promise.all([db.database.from('fields').select('id,name').order('name'),db.database.from('domains').select('field_id,name').order('name'),db.database.from('projects').select('field,domain').limit(10000)]);
 const fields=checked(results[0]),domains=checked(results[1]),projects=checked(results[2]);const names=new Set<string>(fields.map(f=>f.name));const grouped:Record<string,Set<string>>={};for(const f of fields)grouped[f.name]=new Set();
 for(const d of domains){const field=fields.find(f=>f.id===d.field_id);if(field)grouped[field.name].add(d.name);}
 for(const p of projects){names.add(p.field);(grouped[p.field]??=new Set()).add(p.domain);}
 const option=(value:string)=>({value,label:value});
 return {fields:[{value:'',label:'All fields'},...[...names].sort().map(option)],domainsByField:Object.fromEntries(Object.entries(grouped).map(([f,list])=>[f,[{value:'',label:'All domains'},...[...list].sort().map(option)]])),allDomains:[{value:'',label:'All domains'},...[...new Set(Object.values(grouped).flatMap(s=>[...s]))].sort().map(option)],commitments:[{value:'',label:'Any'},{value:'casual',label:'Casual · 2–5 hrs/week'},{value:'part-time',label:'Part-time · 5–10 hrs/week'},{value:'intensive',label:'Intensive · 10+ hrs/week'}],statuses:[...projectStatuses.map(value=>({value,label:statusLabel(value)})),{value:'all',label:'All statuses'}],sorts:[{value:'newest',label:'Newest first'},{value:'oldest',label:'Oldest first'},{value:'roles',label:'Most roles open'}]};
}
