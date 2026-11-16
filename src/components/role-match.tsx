"use client";
import Link from 'next/link';
import {useMatchPercent} from './feature-flags';
import {MATCH_COPY,getBestRoleMatch,bestRoleCopy,type MatchableRole,type RoleMatch} from '@/lib/matching/roleMatch';
export function RoleMatchBadge({match,snapshot}:{match?:RoleMatch;snapshot?:number|null}){
 const show=useMatchPercent();if(!show)return null;
 if(snapshot!==undefined)return snapshot===null?null:<Badge value={snapshot}/>;
 if(!match||match.state==='owner'||match.state==='missing_role')return null;
 if(match.state==='no_profile')return <Link className="match-state" href="/profile#skills-editor">{MATCH_COPY.noProfile}</Link>;
 if(match.state==='updating')return <span className="match-state" role="status">{MATCH_COPY.updating}</span>;
 return match.matchPercent===null?null:<Badge value={match.matchPercent}/>;
}
function Badge({value}:{value:number}){return <span className="role-match-badge" title={MATCH_COPY.tooltip}><svg viewBox="0 0 36 36" width="34" height="34" aria-hidden="true"><circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" opacity=".15" strokeWidth="3"/><circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" pathLength="100" strokeDasharray={`${value} 100`} transform="rotate(-90 18 18)"/></svg><b>{value}% match</b></span>;}
export function BestRoleMatch({roles,compact=false}:{roles:MatchableRole[];compact?:boolean}){
 const show=useMatchPercent();if(!show)return null;const best=getBestRoleMatch(roles);
 if(!best){const open=roles.filter(r=>r.filled_count<r.slots);if(open.some(r=>r.match?.state==='no_profile'))return <Link href="/profile#skills-editor">{MATCH_COPY.noProfile}</Link>;if(open.some(r=>r.match?.state==='updating'))return <p className="match-state">{MATCH_COPY.updating}</p>;return null;}
 const copy=bestRoleCopy(best.matchPercent);
 return <p className={compact?'best-role-match compact':'best-role-match'} title={MATCH_COPY.tooltip}>{compact?<>{MATCH_COPY.compact} <strong>{best.title}</strong> · {best.matchPercent}% match</>:<>{copy.before}<strong>{best.title}</strong>{copy.after}</>}</p>;
}
