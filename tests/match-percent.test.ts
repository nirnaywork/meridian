import {expect,it,vi} from 'vitest';
import {matchPercent,logisticPercent,DEFAULT_PARAMETERS,MATCH_CALIBRATION} from '../src/lib/matching/matchScore';
import {getBestRoleMatch,bestRoleCopy} from '../src/lib/matching/roleMatch';
import {fitLogistic,calibrationReport} from '../scripts/fit-calibration';
vi.mock('server-only',()=>({}));
it('is deterministic, bounded and nondecreasing after integer rounding',()=>{
 for(const provider of ['minilm','hashed'] as const){let previous=0;for(let i=-100;i<=100;i++){const n=matchPercent(i/100,provider);expect(n).toBeGreaterThanOrEqual(1);expect(n).toBeLessThanOrEqual(99);expect(n).toBeGreaterThanOrEqual(previous);expect(n).toBe(matchPercent(i/100,provider));previous=n;}}
 expect(()=>matchPercent(NaN,'minilm')).toThrow();
});
it('matches the requested default anchors and retains separate provider settings',()=>{
 expect([.2,.34,.5,.57,.62,.87].map(c=>Math.round(logisticPercent(c,DEFAULT_PARAMETERS.minilm)))).toEqual([8,22,50,64,72,95]);
 expect(MATCH_CALIBRATION.providers.minilm).not.toEqual(MATCH_CALIBRATION.providers.hashed);
 expect(logisticPercent(.33874228095335296,MATCH_CALIBRATION.providers.minilm)).toBeLessThan(30);
 expect(logisticPercent(.8696515779302533,MATCH_CALIBRATION.providers.minilm)).toBeGreaterThan(90);
 expect(matchPercent(.2,'minilm')).toBeLessThan(15);
});
const role=(id:string,value:number,open=1)=>({id,title:id,slots:open,filled_count:0,match:{roleId:id,matchPercent:value,state:'ready' as const,calibrationVersion:'test',matched_skills:[],missing_skills:[]}});
it('selects only open roles, breaking ties by open slots then display order',()=>{
 expect(getBestRoleMatch([role('full',99,0),role('first',85),role('second',85,2),role('third',85,2)])?.roleId).toBe('second');
 expect(getBestRoleMatch([role('full',99,0)])).toBeNull();expect(getBestRoleMatch([])).toBeNull();
 expect(getBestRoleMatch([{...role('missing',99),match:undefined}])).toBeNull();
});
it('selects the exact copy at each percentage boundary',()=>{
 expect(bestRoleCopy(85).after).toContain('excellent fit');expect(bestRoleCopy(84).after).toContain('best fit');expect(bestRoleCopy(70).after).toContain('best fit');expect(bestRoleCopy(69).after).toContain('closest role');expect(bestRoleCopy(50).after).toContain('closest role');expect(bestRoleCopy(49).before).toBe('Closest role: ');
});
it('handles missing profiles, incompatible versions, owners and missing role vectors',async()=>{
 const {presentRoleMatch}=await import('../src/lib/server/role-matches');vi.stubEnv('EMBEDDING_PROVIDER','minilm');
 const valid={role_id:'r',profile_present:true,role_present:true,compatible:true,model:'minilm',version:'domains-minilm-751bff37-q8-v3',cosine:.62};
 expect(presentRoleMatch(valid).matchPercent).toBe(matchPercent(.62,'minilm'));
 for(const [change,state] of [[{profile_present:false},'no_profile'],[{version:'old'},'updating'],[{compatible:false},'updating'],[{owner:true},'owner'],[{role_present:false},'missing_role']] as const){expect(presentRoleMatch({...valid,...change})).toMatchObject({state,matchPercent:null});}
 vi.unstubAllEnvs();
});
it('fits a positive logistic slope and rejects a fit when a sanity anchor fails',()=>{
 const pairs=[{cosine:.1,relevant:false},{cosine:.2,relevant:false},{cosine:.8,relevant:true},{cosine:.9,relevant:true}];expect(fitLogistic(pairs).k).toBeGreaterThan(0);
 const report=calibrationReport({provider:'hashed',records:[{cosine:0,relevant:false},{cosine:.1,relevant:true},{cosine:.2,relevant:true}],relevant:{median:.1},irrelevant:{mean:0}});expect(report.accepted).toBe(false);expect(report.selected).toEqual(DEFAULT_PARAMETERS.hashed);
});
