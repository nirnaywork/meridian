import { normalizeSkill } from "../../data/taxonomy";
export type SkillInput={name:string;proficiency?:string;importance?:string};
const clean=(s:string|undefined,n=600)=>(s??"").normalize("NFKC").replace(/\s+/g," ").trim().slice(0,n);
const sorted=(s:string[])=>[...new Set(s.map(x=>clean(x)).filter(Boolean))].sort().join(", ");
const names=(s:SkillInput[])=>sorted(s.map(x=>normalizeSkill(x.name)));
const section=(label:string,value:string)=>value?`${label}: ${value}`:"";
const sentences=(parts:string[])=>parts.filter(Boolean).map(x=>x.replace(/[.]+$/,"")+".").join(" ");
export function canonicalProfile(p:{domains?:string[];headline?:string;bio?:string;interests?:string;skills:SkillInput[]}){
 return sentences([...['advanced','intermediate','beginner'].map(level=>section(`Skills (${level})`,names(p.skills.filter(s=>s.proficiency===level)))),section('Domains',sorted(p.domains??[])),clean(p.headline,140),section('Interests',clean(p.interests,200)),section('Bio',clean(p.bio,240))]);
}
export function canonicalRole(r:{domains?:string[];title:string;description:string;skills:SkillInput[]},projectTitle:string){
 return sentences([clean(r.title,100),section('Domains',sorted(r.domains??[])),section('Required skills',names(r.skills.filter(s=>s.importance==='required'))),section('Preferred skills',names(r.skills.filter(s=>s.importance==='preferred'))),clean(r.description),section('Project',clean(projectTitle,120))]);
}
export function canonicalProject(p:{title:string;domains?:string[];category:string;description:string;roles:{title:string;description:string;domains?:string[];skills:SkillInput[]}[]},roleTitlesOnly=false){
 return sentences([clean(p.title,120),clean(p.category,80),section('Domains',sorted(p.domains??[])),section('Required skills',names(p.roles.flatMap(r=>r.skills.filter(s=>s.importance==='required')))),section('Summary',clean(p.description)),section('Roles',roleTitlesOnly?sorted(p.roles.map(r=>r.title)):p.roles.map(r=>canonicalRole(r,p.title)).sort().join(' | '))]);
}
