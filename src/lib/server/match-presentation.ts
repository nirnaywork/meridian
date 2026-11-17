import 'server-only';
import {presentRoleMatch} from './role-matches';
export function presentExploreProject(p:any){return {id:p.id,owner_id:p.owner_id,title:p.title,description:p.description,category:p.category,field:p.field,domain:p.domain,domains:p.domains,skills:p.skills,tags:p.tags,commitment:p.commitment,duration:p.duration,team_size:p.team_size,status:p.status,revision:p.revision,is_demo:p.is_demo,lead_name:p.lead_name,open_roles:p.open_roles,sort_key:p.sort_key,created_at:p.created_at};}
export function overlap(row:any){return {matched_skills:row?.matched_skills??[],missing_skills:row?.missing_skills??[]};}
export function presentParticipation(row:any){
 return {id:row.id,project_id:row.project_id,role_id:row.role_id,status:row.status,message:row.message,created_at:row.created_at,projects:row.projects,project_roles:row.project_roles,profiles:row.profiles,applicant_id:row.applicant_id,invitee_id:row.invitee_id,inviter_id:row.inviter_id,inviter_name:row.profiles?.display_name,breakdown:overlap(row.breakdown),matchPercent:row.role_id?(row.match_percent??null):null,calibrationVersion:row.calibration_version??null};
}
export function presentCandidate(row:any,roleId:string){const b=row.breakdown??{};return {id:row.id,display_name:row.display_name,headline:row.headline,avatar_url:row.avatar_url,is_demo:row.is_demo,match:presentRoleMatch({role_id:roleId,profile_present:true,role_present:true,compatible:true,...b}),breakdown:overlap(b)};}
