import {expect,it} from 'vitest';
import {projectSearchSchema,readProjectFilters,projectFilterParams,PROJECT_FILTER_DEFAULTS} from '../src/lib/project-filters';
it('defaults to open/newest and validates bounded integer pagination',()=>{
 expect(projectSearchSchema.parse({})).toMatchObject({status:'open',sort:'newest',page:1,limit:12});
 for(const invalid of [{page:'0'},{page:'nope'},{page:'1.5'},{limit:'0'},{limit:'31'},{sort:'popular'},{commitment:'unknown'},{status:'unknown'}])expect(projectSearchSchema.safeParse(invalid).success).toBe(false);
});
it('normalizes empty, All and Any choices without treating free text as a choice',()=>{
 for(const value of ['','All','Any',' ALL '])expect(projectSearchSchema.parse({field:value,domain:value,commitment:value,status:value})).toMatchObject({field:'',domain:'',commitment:'',status:'all'});
 expect(projectSearchSchema.parse({search:'Any',skill:'C++',role:'All'})).toMatchObject({search:'Any',skill:'C++',role:'All'});
});
it('round trips shareable URLs and preserves an explicit all-status request',()=>{
 const input={...PROJECT_FILTER_DEFAULTS,search:'Node.js & C++',field:'CS Related',domain:'Web Development',status:'all',page:'2'};
 expect(readProjectFilters(projectFilterParams(input))).toEqual(input);expect(projectFilterParams(PROJECT_FILTER_DEFAULTS).toString()).toBe('');
 expect(readProjectFilters(new URLSearchParams('status=&field=Any')).status).toBe('all');
});
it('limits input length while retaining punctuation for literal parameterized matching',()=>{
 expect(projectSearchSchema.parse({search:"%' OR true --"}).search).toBe("%' OR true --");expect(projectSearchSchema.parse({skill:' C++ '}).skill).toBe('C++');
 expect(projectSearchSchema.safeParse({search:'x'.repeat(101)}).success).toBe(false);
});
