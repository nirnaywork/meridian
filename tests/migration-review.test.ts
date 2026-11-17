import {afterAll,beforeAll,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
import {applyLocalMigration,localPostgres} from './local-postgres';

const foundation=readFileSync('migrations/20261118010000_collaboration-foundation.sql','utf8');
const reads=readFileSync('migrations/20261118020000_collaboration-reads.sql','utf8');
let db:PGlite;
beforeAll(async()=>{db=await localPostgres({through:'20261118030000_task-conflict-response.sql'});},60000);
afterAll(async()=>{await db?.close();});

it('leaves transaction ownership to the InsForge runner without in-file transaction control',()=>{
 for(const sql of [foundation,reads]){
  expect(sql).not.toMatch(/^\s*(?:BEGIN|START TRANSACTION|COMMIT|ROLLBACK)\s*;/gm);
 }
});

it('leaves exactly the four restricted profile/membership policies and no legacy read policy',async()=>{
 const policies=(await db.query("SELECT tablename,policyname,cmd,roles::text[] roles,qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','profile_skills','profile_domains','project_members') ORDER BY tablename")).rows as any[];
 expect(policies).toHaveLength(4);
 expect(policies.map(p=>p.policyname)).toEqual(['profile_domain_read','profile_skills_read','profile_read','team_read']);
 for(const policy of policies){expect(policy.cmd).toBe('SELECT');expect(policy.roles).toEqual(['authenticated']);expect(policy.qual).not.toBe('(verified_user() IS NOT NULL)');}
});

it('aborts the entire foundation migration if an unexpected permissive policy would survive',async()=>{
 await db.exec('CREATE POLICY unexpected_broad_read ON public.profiles FOR SELECT TO authenticated USING(true)');
 await expect(applyLocalMigration(db,foundation)).rejects.toThrow('Unexpected profile or membership policy remains');
 expect((await db.query("SELECT policyname FROM pg_policies WHERE schemaname='public' AND policyname='unexpected_broad_read'")).rows).toHaveLength(1);
 await db.exec('DROP POLICY unexpected_broad_read ON public.profiles');
 await applyLocalMigration(db,foundation);
});

it('rolls back a late failure, including DDL and ACL changes, in either migration',async()=>{
 for(const sql of [foundation,reads]){
  const name='rollback_probe_'+randomUUID().replaceAll('-','');
  const broken=sql+`\nCREATE TABLE public.${name}(id integer); REVOKE EXECUTE ON FUNCTION public.owns_project(uuid) FROM authenticated; SELECT 1/0;`;
  await expect(applyLocalMigration(db,broken)).rejects.toThrow('division by zero');
  expect((await db.query('SELECT to_regclass($1) relation',[`public.${name}`])).rows[0]).toEqual({relation:null});
  expect((await db.query("SELECT has_function_privilege('authenticated','public.owns_project(uuid)','EXECUTE') allowed")).rows[0]).toEqual({allowed:true});
 }
});

it('explicitly denies client/PUBLIC execute for every server-only routine while allowing project_admin',async()=>{
 const names=['add_member','has_capacity','check_actor','consume_rate','submit_match','respond_match','save_profile','save_project','match_breakdown','notify_user','participation_notification','lifecycle_guard','message_change_sequence','collaboration_action','refresh_project_filter_classification','sync_project_filter_classification','sync_domain_choices','snapshot_application_percentage'];
 const result=(await db.query(`SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('project_admin',p.oid,'EXECUTE') admin,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,[names])).rows as any[];
 expect(result).toHaveLength(names.length);
 for(const fn of result)expect(fn).toMatchObject({anon:false,authenticated:false,admin:true,public:false});
 await applyLocalMigration(db,foundation);await applyLocalMigration(db,reads);
});

it('resolves every exact ACL signature after the definitions have executed',async()=>{
 // ACLs include 18 server-only functions plus eight authenticated read helpers.
 const aclSignatures=[...new Set([...(`${foundation}\n${reads}`).matchAll(/(?:REVOKE ALL|GRANT EXECUTE) ON FUNCTION ([^;]+)/g)].flatMap(m=>[...m[1].matchAll(/public\.[a-z_]+\([^)]*\)/g)].map(x=>x[0])))];
 expect(aclSignatures).toHaveLength(26);
 for(const signature of aclSignatures){const result=await db.query<{exists:boolean}>('SELECT to_regprocedure($1) IS NOT NULL AS exists',[signature]);expect(result.rows[0].exists,signature).toBe(true);}
});

async function pendingFixture(initialStatus='open'){
 const owner=randomUUID(),applicant=randomUUID(),invitee=randomUUID(),pid=randomUUID();
 for(const id of [owner,applicant,invitee]){
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
  await db.query("INSERT INTO public.profiles(id,display_name,is_team_lead,onboarding_complete) VALUES($1,'Local lifecycle test',true,true)",[id]);
 }
 await db.query("INSERT INTO public.projects(id,owner_id,title,description,category,commitment,duration,team_size,status) VALUES($1,$2,'Local lifecycle test','Pending record preservation fixture','Testing','casual','1 week',3,$3)",[pid,owner,initialStatus]);
 // Direct fixture inserts also allow the archived test to cover legacy pending
 // records on an already-completed project. No live database is used here.
 const app=(await db.query<{id:string}>("INSERT INTO public.applications(project_id,applicant_id,message,breakdown,status,decided_by) VALUES($1,$2,'Keep this snapshot','{}','pending','system') RETURNING id",[pid,applicant])).rows[0].id;
 const invitation=(await db.query<{id:string}>("INSERT INTO public.invitations(project_id,inviter_id,invitee_id,message,breakdown,status,decided_by) VALUES($1,$2,$3,'Keep this invitation','{}','pending',$2::uuid::text) RETURNING id",[pid,owner,invitee])).rows[0].id;
 const records=async()=>({application:(await db.query('SELECT * FROM public.applications WHERE id=$1',[app])).rows[0],invitation:(await db.query('SELECT * FROM public.invitations WHERE id=$1',[invitation])).rows[0]});
 const change=async(status:string)=>db.query('SELECT public.collaboration_action($1,$2,$3)',[owner,pid,JSON.stringify({action:'status',status})]);
 return {pid,app,invitation,records,change};
}

it('closed, in_progress and reopening preserve pending records and their snapshots',async()=>{
 const f=await pendingFixture();const before=await f.records();
 for(const status of ['closed','in_progress','open','closed']){await f.change(status);expect(await f.records()).toEqual(before);}
 expect((await db.query("SELECT id FROM public.notifications WHERE project_id=$1 AND type IN ('applications.rejected','invitations.cancelled')",[f.pid])).rows).toHaveLength(0);
});

it.each(['completed','cancelled','archived'])('%s resolves pending participation while preserving snapshot data',async status=>{
 const f=await pendingFixture(status==='archived'?'completed':'open');const before=await f.records() as any;
 await f.change(status);const after=await f.records() as any;
 expect(after.application.status).toBe('rejected');expect(after.invitation.status).toBe('cancelled');
 expect(after.application.decided_at).toBeTruthy();expect(after.invitation.decided_at).toBeTruthy();
 for(const kind of ['application','invitation'])for(const key of ['id','cosine','match_percent','calibration_version','breakdown','created_at','message'])expect(after[kind][key]).toEqual(before[kind][key]);
 const events=(await db.query<{type:string}>("SELECT type FROM public.notifications WHERE project_id=$1 AND type IN ('applications.rejected','invitations.cancelled') ORDER BY type",[f.pid])).rows;
 expect(events.map(e=>e.type)).toEqual(['applications.rejected','invitations.cancelled']);
});

it('Find Talent excludes unrelated private users and includes eligible public or relationship contacts',async()=>{
 const lead=randomUUID(),project=randomUUID(),role=randomUUID(),shared=randomUUID();
 async function user(visibility='private',embedding=true){const id=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,display_name,visibility,is_team_lead,onboarding_complete) VALUES($1,$2,$3,true,true)',[id,'Local migration test',visibility]);if(embedding)await db.query("INSERT INTO public.profile_embeddings(profile_id,embedding,source_hash,model,version) VALUES($1,$2::vector,'fixture','talent-fixture','v1')",[id,JSON.stringify([1,...Array(383).fill(0)])]);return id;}
 await db.query('INSERT INTO auth.users(id) VALUES($1)',[lead]);await db.query("INSERT INTO public.profiles(id,display_name,is_team_lead,onboarding_complete) VALUES($1,'Local lead',true,true)",[lead]);
 for(const id of [project,shared])await db.query("INSERT INTO public.projects(id,owner_id,title,description,category,commitment,duration,team_size) VALUES($1,$2,'Local talent test','Visibility test only','Testing','casual','1 week',8)",[id,lead]);
 await db.query("INSERT INTO public.project_roles(id,project_id,title,slots) VALUES($1,$2,'Builder',7)",[role,project]);
 await db.query("INSERT INTO public.role_embeddings(role_id,embedding,source_hash,model,version) VALUES($1,$2::vector,'fixture','talent-fixture','v1')",[role,JSON.stringify([1,...Array(383).fill(0)])]);
 const unrelated=await user(),publicUser=await user('public'),applicant=await user(),invitee=await user(),teammateElsewhere=await user(),alreadyHere=await user(),missingVector=await user('public',false),incompatible=await user('public');
 await db.query("UPDATE public.profile_embeddings SET version='v2' WHERE profile_id=$1",[incompatible]);
 await db.query("SELECT public.submit_match($1,$2,$3,'apply')",[applicant,project,role]);
 await db.query("SELECT public.submit_match($1,$2,$3,'invite',$4)",[lead,project,role,invitee]);
 await db.query('SELECT public.add_member($1,$2,NULL)',[shared,teammateElsewhere]);
 await db.query('SELECT public.add_member($1,$2,$3)',[project,alreadyHere,role]);
 const candidates=await db.transaction(async tx=>{await tx.query("SELECT set_config('test.user_id',$1,true)",[lead]);await tx.exec('SET LOCAL ROLE authenticated');return (await tx.query<{result:any[]}>('SELECT public.match_candidates_for_role($1,50) result',[role])).rows[0].result;});
 expect(candidates.map(c=>c.id).sort()).toEqual([publicUser,applicant,invitee,teammateElsewhere].sort());
 for(const excluded of [unrelated,alreadyHere,missingVector,incompatible,lead])expect(candidates.some(c=>c.id===excluded)).toBe(false);
 for(const candidate of candidates){expect(candidate).not.toHaveProperty('embedding');expect(candidate).not.toHaveProperty('trace');}
});
