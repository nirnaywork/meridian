import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {admin,must} from './lib';
import {configuredProvider,EMBEDDING_VERSIONS} from '../src/lib/matching/identity';
export async function verifyEmbeddings(){
 const provider=configuredProvider(),version=EMBEDDING_VERSIONS[provider],report=[];
 for(const table of ['profile_embeddings','project_embeddings','role_embeddings']){
  const rows=must(await admin.database.from(table).select('model,version,embedding,trace').limit(10000));
  const identities=[...new Set(rows.map((r:any)=>r.model+'/'+r.version))];
  assert.deepEqual(identities,[provider+'/'+version],`${table}: mixed or incorrect providers/versions`);
  let invalid=0;const density:number[]=[];for(const row of rows){const v=typeof row.embedding==='string'?JSON.parse(row.embedding):row.embedding;if(!v||v.length!==384||Math.abs(Math.hypot(...v)-1)>1e-5||!row.trace)invalid++;density.push(v?.filter((n:number)=>n!==0).length??0);}
  assert.equal(invalid,0,`${table}: invalid vector or missing trace`);if(provider==='minilm')assert(Math.min(...density)>=380,`${table}: unexpected sparse MiniLM vector`);
  report.push({table,rows:rows.length,model:provider,version,invalid,minNonZeroDimensions:Math.min(...density),maxNonZeroDimensions:Math.max(...density)});
 }
 writeFileSync('docs/change4-vector-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));return report;
}
if(process.argv[1]?.endsWith('verify-embeddings.ts'))await verifyEmbeddings();
