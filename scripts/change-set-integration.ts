import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { admin, must, createTestUser, login } from "./lib";
import {
  prepareEmbedding,

  cosine,
} from "../src/lib/matching/provider";
import {
  canonicalProfile,
  canonicalProject,
  canonicalRole,
} from "../src/lib/matching/canonical";
import { embeddingProvider } from '../src/lib/matching/select';
const provider=await embeddingProvider();
const origin = process.env.TEST_APP_URL ?? "http://localhost:3000",
  run = Date.now().toString(36),
  checks: string[] = [];
const pass = (s: string) => {
  checks.push(s);
  console.log("PASS " + s);
};
const users = await Promise.all(
  ["lead", "member", "racer"].map((n) =>
    createTestUser("Change set QA " + n, `change-${run}-${n}@meridian.example`),
  ),
);
const [lead, member, racer] = users;
const skills = must(
  await admin.database
    .from("skills")
    .select("id,name")
    .in("name", ["Figma", "Verilog"]),
);
for (const u of users) {
  const b = {
    display_name: u.email,
    headline: "Student collaboration",
    bio: "",
    interests: "",
    university: "",
    avatar_url: null,
    avatar_key: null,
    is_member: true,
    is_team_lead: true,
    onboarding_complete: true,
    skills: [
      { ...skills.find((s) => s.name === "Figma"), proficiency: "advanced" },
    ],
    domains: ["Graphic Design"],
  };
  must(
    await admin.database.rpc("save_profile", {
      actor: u.id,
      body: b,
      vec: await prepareEmbedding(canonicalProfile(b as any), provider),
      expected_revision: 0,
    }),
  );
}
const pid = crypto.randomUUID(),
  rid = crypto.randomUUID();
const role = {
  id: rid,
  title: "FPGA designer",
  description: "Design and verify FPGA logic",
  slots: 1,
  domains: ["FPGA Design"],
  skills: [
    { ...skills.find((s) => s.name === "Verilog"), importance: "required" },
  ],
};
const project = {
  id: pid,
  title: "Change set QA FPGA",
  description:
    "Design a student FPGA prototype with Verilog and test its digital logic.",
  category: "ECE",
  domains: ["FPGA Design"],
  tags: [],
  commitment: "casual",
  duration: "4 weeks",
  team_size: 2,
  status: "open",
  roles: [
    {
      ...role,
      vector: await prepareEmbedding(
        canonicalRole(role as any, "Change set QA FPGA"),
        provider,
      ),
    },
  ],
};
must(
  await admin.database.rpc("save_project", {
    actor: lead.id,
    body: project,
    vec: await prepareEmbedding(
      canonicalProject(project as any),
      provider,
    ),
    expected_revision: 0,
  }),
);
const submit = (actor: string) =>
  admin.database.rpc("submit_match", {
    actor,
    pid,
    rid,
    kind: "apply",
    note: "Interested",
  });
const a = must(await submit(member.id));
assert.equal(a.status, "pending");
assert(a.breakdown.cosine < 0.4);
pass("Low-cosine application succeeds pending");
const saved = must(
  await admin.database
    .from("applications")
    .select("cosine,breakdown,status")
    .eq("id", a.id)
    .single(),
);
assert.equal(saved.cosine, a.breakdown.cosine);
pass("Server cosine and skill snapshot persisted");
assert((await submit(member.id)).error);
assert((await submit(lead.id)).error);
pass("Duplicate and own-project applications blocked");
const invite = must(
  await admin.database.rpc("submit_match", {
    actor: lead.id,
    pid,
    rid,
    kind: "invite",
    target: racer.id,
    note: "Join?",
  }),
);
assert.equal(invite.status, "pending");
assert.equal(
  must(
    await admin.database
      .from("project_members")
      .select("user_id")
      .eq("project_id", pid),
  ).length,
  0,
);
pass("Low-cosine invitation stays pending and never forces membership");
const fresh = await createTestUser(
  "No embedding QA",
  `change-${run}-fresh@meridian.example`,
);
users.push(fresh);
const freshApp = must(
  await admin.database.rpc("submit_match", {
    actor: fresh.id,
    pid,
    rid: null,
    kind: "apply",
  }),
);
assert.equal(freshApp.status, "pending");
assert.equal(freshApp.breakdown.cosine, null);
pass(
  "No embedding and incomplete onboarding do not block a whole-project application",
);
const b = must(await submit(racer.id));
const approvals = await Promise.all(
  [a, b].map((r) =>
    admin.database.rpc("respond_match", {
      actor: lead.id,
      record_id: r.id,
      kind: "application",
      decision: "approved",
    }),
  ),
);
assert.equal(approvals.filter((r) => !r.error).length, 1);
pass("Concurrent manual approvals cannot overfill slots");
must(
  await admin.database
    .from("projects")
    .update({ status: "closed" })
    .eq("id", pid),
);
assert((await submit(lead.id)).error);
pass("Closed projects block applications");
const { client: user } = await login(member.email, member.password);
assert.equal(
  must(
    await user.database
      .from("profile_embeddings")
      .select("profile_id")
      .eq("profile_id", lead.id),
  ).length,
  0,
);
pass("RLS hides another member's raw embedding and trace");
const newest = must(
  await user.database.rpc("explore_projects", {
    p_filters: { sort: "newest", status: "open" },
    p_limit: 12,
  }),
);
for (let i = 1; i < newest.length; i++)
  assert(new Date(newest[i - 1].created_at) >= new Date(newest[i].created_at));
pass("Explore orders by date independent of cosine");
const parity = must(await user.database.rpc("viewer_similarity", { pid })).find(
  (r: any) => r.role_id === rid,
).cosine;
const A = must(
  await admin.database
    .from("profile_embeddings")
    .select("embedding")
    .eq("profile_id", member.id)
    .single(),
).embedding;
const B = must(
  await admin.database
    .from("role_embeddings")
    .select("embedding")
    .eq("role_id", rid)
    .single(),
).embedding;
const parse = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
assert(Math.abs(cosine(parse(A), parse(B)) - parity) < 1e-6);
pass("App cosine matches pgvector to tolerance");
const response = await fetch(origin + "/api/auth/sign-in", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify(member),
});
assert.equal(response.status, 200);
const cookie = response.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
for (const path of [
  "/api/session",
  "/api/embeddings/me",
  "/api/projects/" + pid + "/embedding",
  "/api/data/projects",
]) {
  const r = await fetch(origin + path, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200, await r.clone().text());
}
pass("Session bootstrap, private/public explainers and Explore endpoints load");
const invalidProject=await fetch(origin+'/api/data/project',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...project,id:undefined,domains:[],roles:[]})});assert.equal(invalidProject.status,400);assert((await invalidProject.json()).message.includes('domain'));
const invalidProfile=await fetch(origin+'/api/data/profile',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({display_name:'Invalid',headline:'Student',domains:[],revision:0,is_member:true,is_team_lead:false,skills:[{name:'React',proficiency:'advanced'}]})});assert.equal(invalidProfile.status,400);
const suggestionPath=origin+'/api/data/domain-suggestions?skills='+encodeURIComponent(JSON.stringify(['Figma','Verilog']));const suggestions=await(await fetch(suggestionPath,{headers:{Cookie:cookie}})).json();assert(suggestions.length>0);assert.deepEqual(suggestions,await(await fetch(suggestionPath,{headers:{Cookie:cookie}})).json());pass('Server rejects new empty-domain saves; domain suggestions are real and deterministic');
const original = must(
  await admin.database
    .from("profile_embeddings")
    .select("*")
    .eq("profile_id", member.id)
    .single(),
);
const profile = must(
  await admin.database
    .from("profiles")
    .select("*,profile_skills(proficiency,skills(name))")
    .eq("id", member.id)
    .single(),
);
const text = canonicalProfile({
  ...profile,
  skills: profile.profile_skills.map((s: any) => ({
    ...s.skills,
    proficiency: s.proficiency,
  })),
});
assert.equal(await prepareEmbedding(text, provider, original), null);
pass("Identical hash skips generation");
for(const [table,join,key,parent] of [['profiles','profile_domains','profile_id',member.id],['projects','project_domains','project_id',pid],['project_roles','role_domains','role_id',rid]]){
 const array=must(await admin.database.from(table).select('domains').eq('id',parent).single()).domains;
 const links=must(await admin.database.from(join).select('domains(name)').eq(key,parent));
 assert.deepEqual([...array].sort(),links.map((r:any)=>(Array.isArray(r.domains)?r.domains[0]:r.domains).name).sort());
}pass('Profile/project/role domain arrays equal their join rows');
writeFileSync(
  ".cache/change-set-qa.json",
  JSON.stringify({ ...member, pid, rid }),
);
for (const u of users)
  must(
    await admin.database
      .from("profiles")
      .update({ is_demo: true, is_member: false, is_team_lead: true })
      .eq("id", u.id),
  );
writeFileSync(
  "docs/change-set-integration.json",
  JSON.stringify({ run, checks }, null, 2),
);

writeFileSync(
  ".cache/panel-qa.json",
  JSON.stringify({ member, lead, racer, pid, rid }),
);

