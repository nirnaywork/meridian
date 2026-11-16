import {expect,it,vi} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
vi.mock('server-only',()=>({}));
const allowedComponents=new Set(['embedding-explainer.tsx','percentage-explainer.tsx','under-the-hood.tsx','under-the-hood-panel.tsx','under-the-hood-content.tsx']);
function files(root:string):string[]{return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(root,e.name)):[join(root,e.name)]);}
it('CI guard: normal components, pages and API routes contain no raw-match terminology',()=>{
 const violations:string[]=[];
 for(const path of [...files('src/components'),...files('src/app')].filter(p=>/\.tsx?$/.test(p))){const normalized=path.replaceAll('\\','/');if(allowedComponents.has(path.split(/[\\/]/).at(-1)!)||/^src\/app\/api\/(embeddings\/|projects\/\[id\]\/(embedding|similarity)\/)/.test(normalized))continue;
  readFileSync(path,'utf8').split('\n').forEach((line,i)=>{if(/cosine|similarity/i.test(line))violations.push(`${relative('.',path)}:${i+1}: ${line.trim()}`)});
 }
 expect(violations).toEqual([]);console.log('CI display guard: PASS (normal UI/pages/API routes; 5 explainer components and 3 heavy endpoint patterns allowed)');
});
it('response projections discard raw values even when nested in a stored breakdown',async()=>{
 const {presentParticipation,presentCandidate,presentExploreProject}=await import('../src/lib/server/match-presentation');vi.stubEnv('EMBEDDING_PROVIDER','minilm');
 const raw={id:'x',role_id:'r',cosine:.62,match_percent:80,breakdown:{cosine:.62,model:'minilm',version:'domains-minilm-751bff37-q8-v3',matched_skills:['React'],missing_skills:[]}};
 for(const payload of [presentParticipation(raw),presentCandidate(raw,'r'),presentExploreProject(raw)])expect(JSON.stringify(payload)).not.toMatch(/cosine|similarity/i);
 vi.unstubAllEnvs();
});
