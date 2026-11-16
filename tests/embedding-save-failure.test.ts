import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('../src/lib/server/db',()=>({adminClient:()=>({database:mocks}),checked:({data}:any)=>data,HttpError:class extends Error{constructor(message:string,public status=400){super(message)}}}));
vi.mock('../src/lib/matching/select',()=>({embeddingProvider:async()=>{throw Object.assign(new Error('Embedding service unavailable, please retry'),{status:503})}}));
it('a configured-model load failure cannot save profile data or a hashed vector',async()=>{
 vi.stubEnv('EMBEDDING_WRITES_PAUSED','false');const {saveProfile}=await import('../src/lib/server/save');
 await expect(saveProfile('00000000-0000-4000-8000-000000000001',{display_name:'Test',headline:'Student',domains:['Web Development'],is_member:true,is_team_lead:false,revision:0,skills:[{name:'React',proficiency:'advanced'}]})).rejects.toMatchObject({status:503});
 expect(mocks.from).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();vi.unstubAllEnvs();
});
