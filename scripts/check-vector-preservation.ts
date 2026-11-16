import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {admin,must} from './lib';
const now:Record<string,string>={};
for(const [table,key] of [['profile_embeddings','profile_id'],['project_embeddings','project_id'],['role_embeddings','role_id']]){
 const rows=must(await admin.database.from(table).select('*').limit(10000));for(const row of rows)now[table+'/'+row[key]]=createHash('sha256').update(JSON.stringify(row)).digest('hex');
}
if(process.argv.includes('--snapshot')){writeFileSync('.cache/change5-vector-baseline.json',JSON.stringify(now));console.log(`Fingerprinted ${Object.keys(now).length} existing vectors and traces; no data changed.`)}
else {const before=JSON.parse(readFileSync('.cache/change5-vector-baseline.json','utf8'));for(const [key,digest]of Object.entries(before))assert.equal(now[key],digest,`Existing embedding changed: ${key}`);console.log(`PASS: all ${Object.keys(before).length} pre-existing vectors, traces, versions and timestamps are unchanged.`)}
