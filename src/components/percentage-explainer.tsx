"use client";
import {MATCH_CALIBRATION,logisticPercent,type MatchProvider} from '@/lib/matching/matchScore';
import {RoleMatchBadge} from './role-match';
import type {RolePercentageDetail} from '@/lib/embedding-types';
import {useMatchPercent} from './feature-flags';
export default function PercentageExplainer({roles,selectedRoleId}:{roles:RolePercentageDetail[];selectedRoleId:string|null}){
 const show=useMatchPercent();
 const selected=roles.find(r=>r.roleId===selectedRoleId),provider=(selected?.provider??roles.find(r=>r.provider)?.provider) as MatchProvider|undefined,parameters=provider?MATCH_CALIBRATION.providers[provider]:undefined;
 const point=selected?.cosine;
 if(!show)return null;
 return <section className="content-panel percentage-explainer"><h3>How the percentage is calculated</h3>
 {!selected?<p>Select a role to see its percentage calculation. Project-overall comparisons have no percentage.</p>:selected.matchPercent==null?<p>Match is being updated, or a stored embedding is missing.</p>:<><p>Raw cosine: <b>{point?.toFixed(9)}</b></p><RoleMatchBadge snapshot={selected.matchPercent}/></>}
 <code>percent = 100 / (1 + e^(−k(cosine − c0)))</code>
 {parameters&&<><p>Provider: {provider}. k = {parameters.k}; c0 = {parameters.c0}. Calibration version: {MATCH_CALIBRATION.calibrationVersion}.</p>{point!=null&&selected?.matchPercent!=null&&<p>100 / (1 + e^(−{parameters.k.toFixed(6)} × ({point.toFixed(9)} − {parameters.c0.toFixed(9)}))) = {logisticPercent(point,parameters).toFixed(6)}. Clamp to 1–99, then round: {selected.matchPercent}% match.</p>}
 <svg className="percentage-curve" viewBox="0 0 560 250" role="img" aria-label="Cosine to match percentage curve, with your selected role marked"><line x1="45" y1="210" x2="530" y2="210" stroke="currentColor"/><line x1="45" y1="15" x2="45" y2="210" stroke="currentColor"/><polyline fill="none" stroke="#3c8b6b" strokeWidth="3" points={Array.from({length:101},(_,i)=>{const x=-1+i*.02;return `${45+i*4.8},${210-logisticPercent(x,parameters)*1.9}`}).join(' ')}/><text x="45" y="230" fill="currentColor">−1</text><text x="280" y="230" fill="currentColor">0</text><text x="520" y="230" fill="currentColor">1</text><text x="5" y="25" fill="currentColor">99%</text>{point!=null&&selected?.matchPercent!=null&&<circle cx={45+(point+1)*240} cy={210-logisticPercent(point,parameters)*1.9} r="6" fill="#bb6758"/>}</svg></>}
 <p>Raw cosine is hard to read: unrelated descriptions can already score around 0.3 to 0.5. The S-shaped curve makes the middle range more distinct and keeps strong matches below 100. Parameters were fitted on labelled example pairs; the hashed fit failed a sanity anchor, so it keeps its defaults. This percentage is an estimate derived from embedding similarity, not a probability or a measure of ability. It never controls eligibility or Explore ordering.</p>
 <details><summary>Technical details: current role comparison table</summary><div className="calculation-scroll"><table><thead><tr><th>Role</th><th>Raw cosine</th><th>Role match</th></tr></thead><tbody>{roles.map(r=><tr key={r.roleId} data-role-id={r.roleId}><td>{r.title}</td><td>{r.cosine?.toFixed(9)??'Unavailable'}</td><td><RoleMatchBadge snapshot={r.matchPercent}/></td></tr>)}</tbody></table></div></details></section>;
}
