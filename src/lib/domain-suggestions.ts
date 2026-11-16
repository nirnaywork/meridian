export function rankDomains(rows:{skill_id:string;domain_id:string;domains:{name:string}|{name:string}[]|null}[]){
 const counts=new Map<string,Set<string>>();for(const row of rows){const name=(Array.isArray(row.domains)?row.domains[0]:row.domains)?.name;if(!name)continue;const skills=counts.get(name)??new Set<string>();skills.add(row.skill_id);counts.set(name,skills);}
 return [...counts].map(([name,skills])=>({name,count:skills.size})).sort((a,b)=>b.count-a.count||(a.name<b.name?-1:a.name>b.name?1:0)).slice(0,5);
}
