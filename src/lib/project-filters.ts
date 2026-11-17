import {z} from 'zod';
export const PROJECT_FILTER_DEFAULTS={search:'',skill:'',role:'',sort:'newest',field:'',domain:'',commitment:'',status:'open',page:'1',limit:'12'};
export type ProjectFilterState=typeof PROJECT_FILTER_DEFAULTS;
const sentinel=(value:string)=>['','all','any'].includes(value.trim().toLowerCase());
const text=(max:number)=>z.string().trim().max(max).default('');
const choice=(max:number)=>text(max).transform(s=>sentinel(s)?'':s);
export const projectSearchSchema=z.object({
 search:text(100),skill:text(70),role:text(100),field:choice(100),domain:choice(100),
 sort:z.string().default('newest').transform(s=>sentinel(s)?'newest':s).pipe(z.enum(['newest','oldest','roles'])),
 commitment:choice(100).pipe(z.enum(['','casual','part-time','intensive'])),
 status:z.string().default('open').transform(s=>sentinel(s)?'all':s.trim()).pipe(z.enum(['all','open','closed','in_progress','completed','cancelled','archived'])),
 page:z.coerce.number().int().min(1).max(100000).default(1),limit:z.coerce.number().int().min(1).max(30).default(12),
});
export function readProjectFilters(params:URLSearchParams):ProjectFilterState{
 const result={...PROJECT_FILTER_DEFAULTS};for(const key of Object.keys(result) as (keyof ProjectFilterState)[]){const value=params.get(key);if(value!==null)result[key]=value;}
 for(const key of ['field','domain','commitment'] as const)if(sentinel(result[key]))result[key]='';
 if(sentinel(result.status))result.status='all';if(sentinel(result.sort))result.sort='newest';return result;
}
export function projectFilterParams(filters:ProjectFilterState){const params=new URLSearchParams();for(const key of Object.keys(PROJECT_FILTER_DEFAULTS) as (keyof ProjectFilterState)[])if(filters[key]!==PROJECT_FILTER_DEFAULTS[key])params.set(key,filters[key]);return params;}
export type FilterOption={value:string;label:string};
export type ProjectFilterOptions={fields:FilterOption[];domainsByField:Record<string,FilterOption[]>;allDomains:FilterOption[];commitments:FilterOption[];statuses:FilterOption[];sorts:FilterOption[]};
