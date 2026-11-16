import 'server-only';
import {adminClient,checked,HttpError} from './db';
import {saveProfile,saveProject} from './save';
export async function regenerateSavedEmbedding(actor:string,kind:'profile'|'project',id?:string){
 const db=adminClient();
 if(kind==='profile'){
  const p=checked(await db.database.from('profiles').select('*,profile_skills(proficiency,skills(id,name))').eq('id',actor).limit(1))[0];if(!p)throw new HttpError('Add your skills first',404);
  return saveProfile(actor,{...p,skills:p.profile_skills.map((s:any)=>({...s.skills,proficiency:s.proficiency}))});
 }
 const p=checked(await db.database.from('projects').select('*,project_roles(id,title,description,slots,domains,project_role_skills(importance,skills(id,name)))').eq('id',id!).eq('owner_id',actor).limit(1))[0];if(!p)throw new HttpError('Only the project lead can regenerate this embedding',403);
 return saveProject(actor,{...p,roles:p.project_roles.map((r:any)=>({...r,skills:r.project_role_skills.map((s:any)=>({...s.skills,importance:s.importance}))}))});
}
