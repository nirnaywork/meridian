import {readFileSync,writeFileSync} from 'node:fs';
import {matchPercent} from '../src/lib/matching/matchScore';
import {getBestRoleMatch,bestRoleCopy} from '../src/lib/matching/roleMatch';
const rows=JSON.parse(readFileSync('.cache/change5-nirnay-roles.json','utf8')).rows;
const roles=rows.map((r:any)=>({...r,match:{roleId:r.id,matchPercent:matchPercent(r.cosine,r.model),state:'ready',calibrationVersion:'role-percent-2026-11-v1',matched_skills:[],missing_skills:[]}}));
const best=getBestRoleMatch(roles)!,copy=bestRoleCopy(best.matchPercent);
const result={profile:'Nirnay',project:'Re:Search',roles:roles.map((r:any)=>({role:r.title,cosine:r.cosine,matchPercent:r.match.matchPercent})),headline:copy.before+best.title+copy.after};writeFileSync('docs/change5-examples.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
