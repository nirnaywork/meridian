import {writeFileSync} from 'node:fs';
import {admin,must} from './lib';
import {loadModel,MAX_SEQUENCE_LENGTH} from '../src/lib/matching/minilm';
import {canonicalProfile,canonicalProject,canonicalRole} from '../src/lib/matching/canonical';
const pipe=await loadModel();
const tokens=(text:string)=>Number(pipe.tokenizer(text,{truncation:false}).input_ids.size);
const report=(rows:{id:string;text:string}[])=>{const counts=rows.map(r=>({id:r.id,tokens:tokens(r.text)}));const truncated=counts.filter(r=>r.tokens>MAX_SEQUENCE_LENGTH);return {rows:rows.length,truncated:truncated.length,percentage:rows.length?100*truncated.length/rows.length:0,maxTokens:Math.max(0,...counts.map(r=>r.tokens)),truncatedRows:truncated}};
const stored:Record<string,unknown>={};
for(const table of ['profile_embeddings','project_embeddings','role_embeddings']){
 const rows=must(await admin.database.from(table).select('trace').limit(10000));
 stored[table]=report(rows.map((r:any,i:number)=>({id:String(i),text:r.trace?.canonical_text??''})));
}
const profiles=must(await admin.database.from('profiles').select('id,headline,bio,interests,domains,profile_skills(proficiency,skills(name))').limit(10000));
const projects=must(await admin.database.from('projects').select('id,title,category,description,domains,project_roles(id,title,description,domains,project_role_skills(importance,skills(name)))').limit(10000));
const shaped=projects.map((p:any)=>({...p,roles:p.project_roles.map((r:any)=>({...r,skills:r.project_role_skills.map((s:any)=>({...s.skills,importance:s.importance}))}))}));
const candidate={profiles:report(profiles.filter((p:any)=>p.profile_skills.length).map((p:any)=>({id:p.id,text:canonicalProfile({...p,skills:p.profile_skills.map((s:any)=>({...s.skills,proficiency:s.proficiency}))})}))),projectsFullRoles:report(shaped.map((p:any)=>({id:p.id,text:canonicalProject(p,false)}))),projectsRoleTitles:report(shaped.map((p:any)=>({id:p.id,text:canonicalProject(p,true)}))),roles:report(shaped.flatMap((p:any)=>p.roles.map((r:any)=>({id:r.id,text:canonicalRole(r,p.title)}))))};
const result={limit:MAX_SEQUENCE_LENGTH,stored,candidate};writeFileSync('docs/change4-truncation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
