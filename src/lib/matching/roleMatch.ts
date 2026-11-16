export type MatchState='ready'|'no_profile'|'updating'|'missing_role'|'owner';
export type RoleMatch={roleId:string;matchPercent:number|null;state:MatchState;calibrationVersion:string;matched_skills:string[];missing_skills:string[]};
export type MatchableRole={id:string;title:string;slots:number;filled_count:number;match?:RoleMatch};
export function orderRolesForDisplay<T extends {id:string;title:string}>(roles:T[]){return [...roles].sort((a,b)=>a.title.localeCompare(b.title,'en')||a.id.localeCompare(b.id));}
export function getBestRoleMatch(roles:MatchableRole[]){
 let best:{roleId:string;title:string;matchPercent:number;openSlots:number}|null=null;
 for(const role of roles){const openSlots=role.slots-role.filled_count,value=role.match?.matchPercent;if(openSlots<=0||value==null||role.match?.state!=='ready')continue;
  if(!best||value>best.matchPercent||(value===best.matchPercent&&openSlots>best.openSlots))best={roleId:role.id,title:role.title,matchPercent:value,openSlots};
 }return best;
}
export const MATCH_COPY={tooltip:"Estimated from how closely your skills line up with this role. It's a guide, not a measure of ability.",noProfile:'Add your skills to see how well you fit',updating:'Match is being updated',compact:'Best fit:',bands:[{min:85,before:'',after:' is an excellent fit: {X}% match with your skill set.'},{min:70,before:'',after:' looks like your best fit: {X}% match with your skills.'},{min:50,before:'',after:' is your closest role here: {X}% match with your skills.'},{min:0,before:'Closest role: ',after:' at {X}% match. Adding related skills to your profile can raise it.'}]} as const;
export function bestRoleCopy(value:number){const band=MATCH_COPY.bands.find(b=>value>=b.min)!;return {before:band.before,after:band.after.replace('{X}',String(value))};}
