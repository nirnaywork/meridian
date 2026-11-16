import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {admin,must} from './lib';
const base=process.env.TEST_APP_URL??'http://localhost:3000',who=JSON.parse(readFileSync('.cache/change5-qa.json','utf8')).member;
const auth=await fetch(base+'/api/auth/sign-in',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(who)});assert.equal(auth.status,200,await auth.clone().text());const cookie=auth.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const rows=must(await admin.database.from('projects').select('id,title,description,tags,field,domain,domains,commitment,status,created_at,project_roles(id,title,slots,filled_count,project_role_skills(skills(name)))').limit(10000));
const domains=must(await admin.database.from('domains').select('id,name,field_id'));const fields=must(await admin.database.from('fields').select('id,name'));const joins=must(await admin.database.from('project_domains').select('project_id,domain_id'));
const checks:string[]=[];const pass=(s:string)=>{checks.push(s);console.log('PASS '+s)};
async function request(filters:Record<string,string>){const r=await fetch(base+'/api/projects?'+new URLSearchParams({status:'all',limit:'30',...filters}),{headers:{Cookie:cookie}});assert.equal(r.status,200,await r.clone().text());return r.json()}
const contains=(s:string,q:string)=>(s??'').toLowerCase().includes(q.toLowerCase());
function expected(f:Record<string,string>){const result=rows.filter((p:any)=>(!f.status||f.status==='all'||p.status===f.status)&&(!f.search||contains([p.title,p.description,...p.tags].join(' '),f.search))&&(!f.commitment||p.commitment===f.commitment)&&(!f.domain||p.domain===f.domain||p.domains.includes(f.domain))&&(!f.field||p.field===f.field||joins.some(j=>j.project_id===p.id&&fields.find(x=>x.id===domains.find(d=>d.id===j.domain_id)?.field_id)?.name===f.field))&&(!f.skill||p.project_roles.some((r:any)=>r.project_role_skills.some((s:any)=>contains(s.skills.name,f.skill))))&&(!f.role||p.project_roles.some((r:any)=>r.filled_count<r.slots&&contains(r.title,f.role))));
 return result.sort((a:any,b:any)=>{const key=(p:any)=>f.sort==='roles'?p.project_roles.filter((r:any)=>r.filled_count<r.slots).length:(f.sort==='oldest'?-1:1)*new Date(p.created_at).getTime();return key(b)-key(a)||b.id.localeCompare(a.id)});
}
async function check(label:string,filter:Record<string,string>){const response=await request(filter),truth=expected(filter);assert.equal(response.total,truth.length,label+' total');assert.deepEqual(response.data.map((p:any)=>p.id),truth.slice(0,30).map((p:any)=>p.id),label+' IDs/order');assert(!JSON.stringify(response).includes('"cosine"'));pass(label)}
await check('Existing projects render and keep neutral newest ordering',{});
await check('Search matches tags case-insensitively',{search:'OPEN SOURCE'});
await check('Search matches titles/descriptions case-insensitively',{search:'student'});
await check('Skill uses case-insensitive partial names',{skill:'rea'});
await check('Skill punctuation is literal',{skill:'C++'});
await check('Role searches open role titles only',{role:'engineer'});
const sample=rows.find((p:any)=>p.project_roles.some((r:any)=>r.filled_count<r.slots&&r.project_role_skills.length)) as any;assert(sample);
const role=sample.project_roles.find((r:any)=>r.filled_count<r.slots&&r.project_role_skills.length);
await check('Field exact match includes backfilled legacy classifications',{field:sample.field});await check('Domain exact match',{domain:sample.domain});await check('Commitment exact match',{commitment:sample.commitment});
for(const status of ['open','closed','in_progress'])await check('Status '+status,{status});
await check('Oldest sort',{sort:'oldest'});await check('Most roles open sort',{sort:'roles'});
await check('All filters combine with AND',{search:sample.title,skill:role.project_role_skills[0].skills.name,role:role.title,field:sample.field,domain:sample.domain,commitment:sample.commitment,status:sample.status,sort:'oldest'});
await check('Injection and wildcard characters remain literal',{search:"%' OR true --"});await check('No matches is an empty page',{search:'no-project-has-this-unique-filter-12345'});
const all=await request({field:'All',domain:'Any',commitment:'Any',status:'All'});assert.equal(all.total,rows.length);pass('All/Any choices remove exact filters');
const page2=await request({page:'2',limit:'2'});assert.equal(page2.page,2);assert.equal(page2.limit,2);assert.equal(page2.total,rows.length);assert.deepEqual(page2.data.map((p:any)=>p.id),expected({}).slice(2,4).map(p=>p.id));pass('Page/limit return the correct slice and full total');
for(const f of [{page:'0'},{limit:'31'},{sort:'newest;drop table projects'}] as Record<string,string>[]){const r=await fetch(base+'/api/projects?'+new URLSearchParams(f),{headers:{Cookie:cookie}});assert.equal(r.status,400)}pass('Invalid and injected pagination/sort are rejected');
const opt=await fetch(base+'/api/filters/options',{headers:{Cookie:cookie}});assert.equal(opt.status,200);const options=await opt.json();for(const d of domains){const name=fields.find(f=>f.id===d.field_id)!.name;assert(options.domainsByField[name].some((o:any)=>o.value===d.name))}pass('Dropdown options come from the live taxonomy and group domains by field');
assert(rows.every(p=>p.field&&p.domain&&p.commitment&&p.status&&p.created_at));pass('Every existing project has nonempty filter metadata');
const report={base,projectCount:rows.length,checks};writeFileSync(process.env.FILTER_REPORT_PATH??'docs/explore-filter-validation.json',JSON.stringify(report,null,2));

