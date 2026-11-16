import 'server-only';
import {checked,type session} from './db';
import {configuredProvider,EMBEDDING_VERSIONS} from '../matching/identity';
import {matchPercent,MATCH_CALIBRATION,type MatchProvider} from '../matching/matchScore';
import {orderRolesForDisplay,type RoleMatch} from '../matching/roleMatch';
type Db=Awaited<ReturnType<typeof session>>['db'];
export function presentRoleMatch(row:any):RoleMatch{
 const provider=configuredProvider();
 const state=row.owner?'owner':!row.profile_present?'no_profile':!row.role_present?'missing_role':!row.compatible||row.model!==provider||row.version!==EMBEDDING_VERSIONS[provider]?'updating':'ready';
 return {roleId:row.role_id,state,matchPercent:state==='ready'&&row.cosine!=null?matchPercent(row.cosine,row.model as MatchProvider):null,calibrationVersion:MATCH_CALIBRATION.calibrationVersion,matched_skills:row.matched_skills??[],missing_skills:row.missing_skills??[]};
}
export async function readRoleComparisons(db:Db,viewerId:string,roleIds:string[]){if(!roleIds.length)return [];return checked(await db.database.rpc('role_matches_for_viewer',{p_viewer:viewerId,p_roles:[...new Set(roleIds)]})) as any[];}
export async function getRoleMatchesForViewer(db:Db,viewerId:string,roleIds:string[]){return (await readRoleComparisons(db,viewerId,roleIds)).map(presentRoleMatch);}
export async function attachRoleMatches(db:Db,viewerId:string,projects:any[]){
 if(!projects.length)return [];
 const roles=checked(await db.database.from('project_roles').select('id,project_id,title,slots,filled_count').in('project_id',projects.map(p=>p.id)).order('title').order('id').limit(500));
 const matches=await getRoleMatchesForViewer(db,viewerId,roles.map(r=>r.id));const byId=new Map(matches.map(m=>[m.roleId,m]));
 return projects.map(p=>({...p,roles:orderRolesForDisplay(roles.filter(r=>r.project_id===p.id)).map(r=>({...r,match:byId.get(r.id)}))}));
}
