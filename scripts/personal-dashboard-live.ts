import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {request,type APIRequestContext} from '@playwright/test';
import {admin,must,createTestUser,login} from './lib';
import {cleanupTestRecords,type TestRegistry} from './cleanup-test-records';
const origin=process.env.TEST_APP_URL??'http://localhost:3000',registry:TestRegistry={users:[],projects:[]},clients:APIRequestContext[]=[];
const report:{checks:{name:string;status:string;error?:string}[];ids:Record<string,unknown>;cleanup?:unknown;error?:string}={checks:[],ids:{}};
const persist=()=>{
 writeFileSync('.cache/personal-live-registry.json',JSON.stringify(registry,null,2));
 writeFileSync('docs/personal-live-api.json',JSON.stringify(report,null,2));
};
async function call(c:APIRequestContext,path:string,input?:unknown,status=200){
 const response=await c.fetch(path,{method:input===undefined?'GET':'POST',data:input});
 assert.equal(response.status(),status,path+': '+await response.text());
 return response.json();
}
async function check(name:string,fn:()=>Promise<void>){
 try{await fn();report.checks.push({name,status:'passed'});console.log('PASS '+name);persist()}
 catch(e){report.checks.push({name,status:'failed',error:(e as Error).message});throw e}
}
let fatal:unknown;
try{
 const stamp=randomUUID(),people=[];
 for(const name of ['Owner','Member','Recipient']){
  const u=await createTestUser('Personal '+name,'personal-api-'+name.toLowerCase()+'-'+stamp+'@example.test');
  registry.users.push({id:u.id,email:u.email});persist();
  must(await admin.database.from('profiles').insert([{id:u.id,display_name:'Personal '+name,is_demo:true,onboarding_complete:true,is_member:true,is_team_lead:name==='Owner'}]));
  const client=await request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});clients.push(client);
  await call(client,'/api/auth/sign-in',{email:u.email,password:u.password});
  people.push({...u,client});
 }
 const [owner,member,recipient]=people,pid=randomUUID();
 report.ids.users=people.map(p=>p.id);report.ids.project=pid;persist();
 must(await admin.database.from('projects').insert([{id:pid,owner_id:owner.id,title:'Personal API verification',description:'Temporary verification project',category:'Web',commitment:'casual',duration:'1 week',team_size:4}]));
 registry.projects.push(pid);persist();
 for(const uid of [member.id,recipient.id])must(await admin.database.rpc('add_member',{pid,uid,rid:null}));
 const path='/api/projects/'+pid+'/workspace',privateId=randomUUID();
 await call(member.client,path,{action:'message',id:privateId,body:'A private message',recipients:[recipient.id]});
 await check('private messages are filtered in the personal definer feed and direct RLS reads',async()=>{
  for(const [viewer,visible] of [[owner,false],[member,true],[recipient,true]] as const){
   const data=await call(viewer.client,'/api/dashboard');
   assert.equal(data.messages.some((m:any)=>m.id===privateId),visible);
   const {client}=await login(viewer.email,viewer.password);
   assert.equal(must(await client.database.from('project_messages').select('id').eq('id',privateId)).length,visible?1:0);
  }
 });
 const id=randomUUID();
 await check('notes, preferences and focus history remain owner-private through all read paths',async()=>{
  await call(member.client,'/api/dashboard',{action:'note',id,day:'2026-11-16',body:'Keep this private',actor:owner.id});
  await call(member.client,'/api/dashboard',{action:'focus_complete',id:randomUUID(),kind:'focus',seconds:60});
  const own=await call(member.client,'/api/dashboard?day=2026-11-17');
  assert(own.notes.some((n:any)=>n.id===id));
  assert(!(await call(owner.client,'/api/dashboard?user_id='+member.id)).notes.some((n:any)=>n.id===id));
  await call(owner.client,'/api/dashboard',{action:'note_delete',id},403);
  const {client}=await login(owner.email,owner.password);
  for(const table of ['daily_notes','dashboard_preferences','focus_sessions']){
   assert.equal(must(await client.database.from(table).select('user_id').eq('user_id',member.id)).length,0);
  }
 });
 await check('DND hides feed and activity, expires and preserves stored notifications',async()=>{
  await call(owner.client,path,{action:'post_update',id:randomUUID(),body:'A real update'});
  const stored=must(await admin.database.from('notifications').select('id').eq('recipient_id',member.id)).length;
  await call(member.client,'/api/dashboard',{action:'preferences',dnd_enabled:true,dnd_until:null});
  const quiet=await call(member.client,'/api/dashboard');
  assert.equal(quiet.messages.length,0);assert.equal(quiet.activity.length,0);
  assert.equal((await call(member.client,'/api/dashboard/preferences')).dnd_enabled,true);
  await call(member.client,'/api/dashboard',{action:'preferences',dnd_until:'2020-01-01T00:00:00Z'});
  assert((await call(member.client,'/api/dashboard')).messages.some((m:any)=>m.id===privateId));
  assert.equal(must(await admin.database.from('notifications').select('id').eq('recipient_id',member.id)).length,stored);
 });
 await check('note completion and removal preserve another users data',async()=>{
  await call(member.client,'/api/dashboard',{action:'note_done',id,done:true});
  await call(member.client,'/api/dashboard',{action:'note',id,day:'2026-11-17',body:'Edited note'});
  await call(member.client,'/api/dashboard',{action:'note_delete',id});
  assert(!(await call(member.client,'/api/dashboard')).notes.some((n:any)=>n.id===id));
 });
 await check('removed members immediately lose message, activity and project feed access',async()=>{
  await call(owner.client,path,{action:'remove',user_id:recipient.id,note:'Test removal'});
  const result=await call(recipient.client,'/api/dashboard');
  assert.equal(result.messages.length,0);assert.equal(result.activity.length,0);assert.equal(result.projects.length,0);
  await call(recipient.client,path,undefined,403);
 });
  await check('same-origin checks and query/body validation reject unsafe input',async()=>{
   await call(member.client,'/api/dashboard?zone=Asia%2FCalcutta');
  const cross=await member.client.post('/api/dashboard',{headers:{Origin:'https://untrusted.example'},data:{action:'note_delete',id}});
  assert.equal(cross.status(),403);
  await call(member.client,'/api/dashboard',{action:'note',id:randomUUID(),day:'2026-11-17',body:'x'.repeat(501)},400);
  await call(member.client,'/api/dashboard?zone=bad%27zone',undefined,400);
 });
}catch(e){fatal=e;report.error=(e as Error).message;console.error(report.error)}
finally{
 for(const c of clients)await c.dispose();
 try{report.cleanup=await cleanupTestRecords(registry,persist);console.log('PASS exact-ID cleanup')}
 catch(e){report.cleanup={status:'failed',error:(e as Error).message};fatal??=e}
 persist();
}
if(fatal)process.exitCode=1;
