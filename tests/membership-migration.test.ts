import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {applyLocalMigration,localPostgres} from './local-postgres';

const foundation=readFileSync('migrations/20261118010000_collaboration-foundation.sql','utf8');
const reads=readFileSync('migrations/20261118020000_collaboration-reads.sql','utf8');

it('migrates a populated 15-member legacy team and keeps respond/capacity/talent/save compatible',async()=>{
 const db=await localPostgres({through:'20261117070000_explore-filters.sql'});
 try{
  const lead=randomUUID(),members=Array.from({length:15},()=>randomUUID()),pid=randomUUID(),rid=randomUUID();
  for(const id of [lead,...members]){
   await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
   await db.query("INSERT INTO public.profiles(id,display_name,is_team_lead,onboarding_complete) VALUES($1,'Local legacy fixture',true,true)",[id]);
  }
  await db.query("INSERT INTO public.projects(id,owner_id,title,description,category,commitment,duration,team_size) VALUES($1,$2,'Legacy populated team','Only local migration fixture data','Testing','casual','1 week',16)",[pid,lead]);
  await db.query("INSERT INTO public.project_roles(id,project_id,title,slots) VALUES($1,$2,'Builder',15)",[rid,pid]);
  for(const id of members)await db.query('SELECT public.add_member($1,$2,$3)',[pid,id,rid]);
  const original=(await db.query('SELECT project_id,user_id,role_id,joined_at FROM public.project_members ORDER BY user_id')).rows;
  expect(original).toHaveLength(15);
  await applyLocalMigration(db,foundation);await applyLocalMigration(db,reads);
  expect((await db.query('SELECT project_id,user_id,role_id,joined_at FROM public.project_members WHERE left_at IS NULL ORDER BY user_id')).rows).toEqual(original);
  expect((await db.query<{n:number}>('SELECT count(DISTINCT id)::int n FROM public.project_members')).rows[0].n).toBe(15);
  expect((await db.query<{n:number}>('SELECT filled_count n FROM public.project_roles WHERE id=$1',[rid])).rows[0].n).toBe(15);
  expect((await db.query<{ok:boolean}>('SELECT public.has_capacity($1,$2) ok',[pid,rid])).rows[0].ok).toBe(false);
  const run=async(actor:string,input:unknown)=>db.query('SELECT public.collaboration_action($1,$2,$3)',[actor,pid,JSON.stringify(input)]);
  await run(members[0],{action:'leave',note:'Local history fixture'});
  expect((await db.query<{ok:boolean}>('SELECT public.has_capacity($1,$2) ok',[pid,rid])).rows[0].ok).toBe(true);
  const application=(await db.query<{result:{id:string}}>("SELECT public.submit_match($1,$2,$3,'apply') result",[members[0],pid,rid])).rows[0].result;
  await db.query("SELECT public.respond_match($1,$2,'application','approved')",[lead,application.id]);
  expect((await db.query('SELECT id FROM public.project_members WHERE project_id=$1 AND user_id=$2 AND left_at IS NULL',[pid,members[0]])).rows).toHaveLength(1);
  expect((await db.query('SELECT id FROM public.project_members WHERE project_id=$1 AND user_id=$2',[pid,members[0]])).rows).toHaveLength(2);
  expect((await db.query<{n:number}>('SELECT filled_count n FROM public.project_roles WHERE id=$1',[rid])).rows[0].n).toBe(15);
  await run(members[0],{action:'leave'});
  const body={id:pid,title:'Legacy populated team',description:'Only local migration fixture data',category:'Testing',tags:[],commitment:'casual',duration:'1 week',team_size:15,status:'open',domains:[],roles:[{id:rid,title:'Builder',description:'',slots:14,domains:[],skills:[]}]};
  const revision=(await db.query<{revision:number}>('SELECT revision FROM public.projects WHERE id=$1',[pid])).rows[0].revision;
  // History now has 16 rows; only 14 active rows count toward this smaller team.
  await db.query('SELECT public.save_project($1,$2,NULL,$3)',[lead,JSON.stringify(body),revision]);
  const vector=JSON.stringify([1,...Array(383).fill(0)]);
  await db.query("UPDATE public.profiles SET visibility='public' WHERE id=$1",[members[0]]);
  await db.query("INSERT INTO public.profile_embeddings(profile_id,embedding,source_hash,model,version) VALUES($1,$2::vector,'fixture','legacy-test','v1')",[members[0],vector]);
  await db.query("INSERT INTO public.role_embeddings(role_id,embedding,source_hash,model,version) VALUES($1,$2::vector,'fixture','legacy-test','v1')",[rid,vector]);
  const candidates=await db.transaction(async tx=>{await tx.query("SELECT set_config('test.user_id',$1,true)",[lead]);await tx.exec('SET LOCAL ROLE authenticated');return (await tx.query<{result:{id:string}[]}>('SELECT public.match_candidates_for_role($1,50) result',[rid])).rows[0].result;});
  expect(candidates.map(c=>c.id)).toEqual([members[0]]);
 }finally{await db.close();}
},60000);

it('rolls back if the proposed catalog retains a positional insert or unfiltered active count',async()=>{
 const db=await localPostgres({through:'20261118030000_task-conflict-response.sql'});
 try{
  const positional=foundation.replace('INSERT INTO public.project_members(project_id,user_id,role_id) VALUES(pid,uid,rid);','INSERT INTO public.project_members VALUES(pid,uid,rid,now());');
  expect(positional).not.toBe(foundation);
  await expect(applyLocalMigration(db,positional)).rejects.toThrow('Positional membership insert remains');
  const unfiltered=foundation.replace('SELECT (SELECT count(*) FROM public.project_members WHERE project_id=pid AND left_at IS NULL)','SELECT (SELECT count(*) FROM public.project_members WHERE project_id=pid)');
  expect(unfiltered).not.toBe(foundation);
  await expect(applyLocalMigration(db,unfiltered)).rejects.toThrow('Active-membership filter missing');
  await db.exec('CREATE VIEW public.unreviewed_members AS SELECT * FROM public.project_members');
  await expect(applyLocalMigration(db,foundation)).rejects.toThrow('Unreviewed project_members view dependency');
  await db.exec('DROP VIEW public.unreviewed_members');
  await applyLocalMigration(db,foundation);
 }finally{await db.close();}
},60000);
