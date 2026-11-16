import {expect,it,vi} from 'vitest';
import {canonicalProfile,canonicalProject,canonicalRole} from '../src/lib/matching/canonical';
import {profileSchema,projectSchema} from '../src/lib/validation';
import {rankDomains} from '../src/lib/domain-suggestions';
it('canonical v3 snapshots omit empty groups and sort domains and skills',()=>{
 expect(canonicalProfile({skills:[],headline:'Student'})).toMatchInlineSnapshot('"Student."');
 expect(canonicalProfile({skills:[{name:'reactjs',proficiency:'advanced'},{name:'TypeScript',proficiency:'advanced'}],domains:['Web Development','Frontend Development'],headline:'Student',interests:'Games',bio:'I build.'})).toMatchInlineSnapshot('"Skills (advanced): React, TypeScript. Domains: Frontend Development, Web Development. Student. Interests: Games. Bio: I build."');
 expect(canonicalRole({title:'Developer',description:'',skills:[]},'Demo')).toMatchInlineSnapshot('"Developer. Project: Demo."');
 expect(canonicalRole({title:'Developer',domains:['Web Development'],description:'Build.',skills:[{name:'React',importance:'required'}]},'Demo')).toMatchInlineSnapshot('"Developer. Domains: Web Development. Required skills: React. Build. Project: Demo."');
 expect(canonicalProject({title:'Demo',category:'Web',description:'',roles:[]})).toMatchInlineSnapshot('"Demo. Web."');
 expect(canonicalProject({title:'Demo',category:'Web',domains:['Web Development'],description:'Build together.',roles:[{title:'Developer',description:'',skills:[{name:'React',importance:'required'}]}]})).toMatchInlineSnapshot('"Demo. Web. Domains: Web Development. Required skills: React. Summary: Build together. Roles: Developer. Required skills: React. Project: Demo."');
});
const profile={display_name:'Test',headline:'Student',is_member:true,is_team_lead:false,onboarding_complete:true,revision:0,skills:[{name:'React',proficiency:'advanced'}],domains:[]};
const project={title:'Demo',category:'Web',description:'Build an accessible student web application.',commitment:'casual',duration:'4 weeks',team_size:3,roles:[],domains:[]};
it('requires a domain for new profiles/projects and lets legacy records load and save',()=>{
 expect(profileSchema.safeParse(profile).success).toBe(false);expect(profileSchema.safeParse({...profile,domains:['Web Development']}).success).toBe(true);
 expect(profileSchema.safeParse({...profile,revision:2}).success).toBe(true);
 expect(projectSchema.safeParse(project).success).toBe(false);expect(projectSchema.safeParse({...project,id:'00000000-0000-4000-8000-000000000001',revision:2}).success).toBe(true);
 expect(projectSchema.safeParse({...project,domains:['Web Development'],roles:[{title:'Developer',description:'',slots:1,skills:[],domains:[]}]}).success).toBe(true);
});
it('ranks suggestions by unique skill count with stable alphabetical ties',()=>{
 const rows=[{skill_id:'1',domain_id:'a',domains:{name:'Web'}},{skill_id:'2',domain_id:'a',domains:{name:'Web'}},{skill_id:'1',domain_id:'b',domains:{name:'Cloud'}},{skill_id:'1',domain_id:'b',domains:{name:'Cloud'}}];
 expect(rankDomains(rows)).toEqual([{name:'Web',count:2},{name:'Cloud',count:1}]);expect(rankDomains([...rows].reverse())).toEqual(rankDomains(rows));
});
it('supports hashed only by explicit configuration without loading a native model',async()=>{
 vi.resetModules();vi.stubEnv('EMBEDDING_PROVIDER','hashed');const {embeddingProvider}=await import('../src/lib/matching/select');expect((await embeddingProvider()).name).toBe('hashed');vi.unstubAllEnvs();
});
