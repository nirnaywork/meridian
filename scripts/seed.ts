import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { admin, must, createTestUser } from "./lib";
import { taxonomy, normalizeSkill } from "../src/data/taxonomy";
import { matchConfig } from "../src/lib/matching/config";
import {
  canonicalProfile,
  canonicalProject,
  canonicalRole,
} from "../src/lib/matching/canonical";
import { prepareEmbedding } from "../src/lib/matching/provider";
import { embeddingProvider } from "../src/lib/matching/select";
import { domains } from "./calibrate";
const members = [
  "Aanya Kapoor",
  "Jamie Lin",
  "Sam Okafor",
  "Meera Shah",
  "Noah Park",
  "Riya Nair",
  "Leo Martins",
  "Aditi Rao",
  "Oliver Chen",
  "Zara Ahmed",
];
const ideas = [
  [
    "Campus Loop",
    "Web",
    "A calmer home for campus life. Bring clubs, student events, and shared resources into one accessible place. We are building a responsive web app that helps students find their community without the noise.",
    "Frontend Developer",
    0,
    2,
  ],
  [
    "Leafline",
    "Climate",
    "Make greener choices visible. Help students track everyday habits and understand their environmental impact through simple data visualizations. We want useful insights, thoughtful design, and a small working prototype.",
    "Data Analyst",
    3,
    2,
  ],
  [
    "Study Space",
    "Education",
    "Find your focus, together. Build a study planner with shared goals and gentle progress tracking. The first version connects course schedules, deep-work sessions, and small study groups.",
    "Mobile Developer",
    4,
    0,
  ],
  [
    "Open Canvas",
    "Design",
    "A living collection of accessible components for student organizations. Research what small clubs need, design a flexible visual system, and publish an open-source library anyone can use.",
    "UX Designer",
    2,
    0,
  ],
  [
    "Signal Garden",
    "ML / AI",
    "Make sense of urban sounds with a small audio classification model. Collect a consent-based dataset, explore signal processing, and build an interactive demo that explains what the model hears.",
    "ML Engineer",
    1,
    3,
  ],
  [
    "Second Chapter",
    "Social impact",
    "Give student books a second life. Build a campus book-exchange platform with searchable listings, a simple reservation flow, and an inclusive experience for people on slow connections.",
    "Frontend Developer",
    0,
    9,
  ],
  [
    "Pocket Pantry",
    "Mobile",
    "Help students cook with what they already have. Create a mobile pantry tracker and a searchable recipe collection, with useful shopping lists and minimal food waste.",
    "Mobile Developer",
    4,
    2,
  ],
  [
    "Tiny Worlds",
    "Game Development",
    "A cozy exploration game about restoring a forgotten garden. Build a playable vertical slice with simple interactions, charming environments, and a feeling of discovery.",
    "Game Developer",
    6,
    2,
  ],
  [
    "Waterwise",
    "Embedded / IoT",
    "Build a low-cost water monitoring prototype for campus gardens. Connect soil sensors, collect readings, and visualize irrigation needs in a small dashboard.",
    "IoT Engineer",
    7,
    3,
  ],
  [
    "The Commons",
    "Content",
    "An independent student publication about people building interesting things. Develop an editorial voice, interview student creators, and launch an accessible digital magazine.",
    "Content Strategist",
    8,
    2,
  ],
  [
    "Launchpad Lab",
    "Product / PM",
    "Turn student ideas into testable prototypes. Interview potential users, map the problem, write clear requirements, and help a small team ship its first useful release.",
    "Product Manager",
    9,
    0,
  ],
  [
    "Open Deploy",
    "DevOps",
    "Make deploying student projects less intimidating. Build a documented starter with continuous integration, containerized services, and practical monitoring for open-source applications.",
    "DevOps Engineer",
    5,
    0,
  ],
  [
    "City in Numbers",
    "Data",
    "Tell better stories about our city with open data. Clean public datasets, explore patterns in transport and green spaces, and publish an interactive visual report.",
    "Data Analyst",
    3,
    8,
  ],
  [
    "Access Map",
    "Social impact",
    "Map accessible routes around campus with input from the people who use them. Research real navigation barriers, design clear maps, and build a responsive community resource.",
    "UX Designer",
    2,
    0,
  ],
  [
    "Re:Search",
    "ML / AI",
    "Help students organize research notes with local semantic search. Use open-source embeddings and a simple retrieval pipeline, then build an interface that makes exploring connections feel natural.",
    "ML Engineer",
    1,
    0,
  ],
] as const;
async function main() {
  const provider = await embeddingProvider();
  must(
    await admin.database
      .from("match_settings")
      .upsert([
        {
          id: true,
          settings: {
            ...matchConfig,
            mode: process.env.MATCH_MODE ?? "composite",
          },
        },
      ]),
  );
  must(
    await admin.database
      .from("skills")
      .upsert(taxonomy, { onConflict: "slug" }),
  );
  const skills = must(
    await admin.database.from("skills").select("id,name").limit(1000),
  );
  const skill = (name: string) => {
    const s = skills.find((s) => s.name === normalizeSkill(name));
    if (!s) throw new Error("Missing " + name);
    return s;
  };
  mkdirSync(".insforge", { recursive: true });
  const file = ".insforge/demo-users.json";
  const ids: Record<string, string> = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {};
  for (let i = 0; i < members.length; i++) {
    if (!ids[members[i]]) {
      ids[members[i]] = (
        await createTestUser(members[i], `demo-${i}@meridian.example`)
      ).id;
      writeFileSync(file, JSON.stringify(ids, null, 2));
    }
    const id = ids[members[i]];
    const body = {
      display_name: members[i],
      headline: `Student ${domains[i][0]} · learning by building`,
      bio: "Demo profile — a fictional student collaborator for exploring Meridian.",
      university: [
        "Northwood University",
        "Riverside Institute",
        "City School of Design",
      ][i % 3],
      interests: "Student projects and open source",
      is_member: true,
      is_team_lead: true,
      avatar_url: null,
      avatar_key: null,
      skills: domains[i]
        .slice(1)
        .map((name) => ({ ...skill(name), proficiency: "advanced" })),
    };
    const old = must(
      await admin.database
        .from("profile_embeddings")
        .select("source_hash,model,version")
        .eq("profile_id", id)
        .limit(1),
    )[0];
    const existing = must(
      await admin.database
        .from("profiles")
        .select("revision")
        .eq("id", id)
        .limit(1),
    )[0];
    const vec = await prepareEmbedding(canonicalProfile(body), provider, old);
    must(
      await admin.database.rpc("save_profile", {
        actor: id,
        body,
        vec,
        expected_revision: existing?.revision ?? 0,
      }),
    );
    must(
      await admin.database
        .from("profiles")
        .update({ is_demo: true })
        .eq("id", id),
    );
  }
  for (let i = 0; i < ideas.length; i++) {
    const [title, category, description, roleTitle, a, b] = ideas[i];
    const id = `d0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const roles = await Promise.all(
      [a, b].map(async (d, j) => {
        const rid = `e0000000-0000-4000-8000-${String(i * 2 + j + 1).padStart(12, "0")}`;
        const role = {
          id: rid,
          title: j === 0 ? roleTitle : domains[d][0],
          description: `Help shape ${title} with your ${domains[d].slice(1).join(", ")} skills. Collaborate on a focused, practical first version.`,
          slots: j === 0 ? 2 : 1,
          skills: domains[d]
            .slice(1)
            .map((name) => ({ ...skill(name), importance: "required" })),
        };
        const old = must(
          await admin.database
            .from("role_embeddings")
            .select("source_hash,model,version")
            .eq("role_id", rid)
            .limit(1),
        )[0];
        return {
          ...role,
          vector: await prepareEmbedding(
            canonicalRole(role, title),
            provider,
            old,
          ),
        };
      }),
    );
    const body = {
      id,
      title,
      category,
      description,
      roles,
      tags: ["Student-led", "Open source"],
      commitment: i % 3 === 0 ? "casual" : "part-time",
      duration: i % 2 ? "6–10 weeks" : "4–8 weeks",
      team_size: 4,
      status: "open",
      auto_approve_strong_matches: true,
    };
    const existing = must(
      await admin.database
        .from("projects")
        .select("revision")
        .eq("id", id)
        .limit(1),
    )[0];
    const old = must(
      await admin.database
        .from("project_embeddings")
        .select("source_hash,model,version")
        .eq("project_id", id)
        .limit(1),
    )[0];
    must(
      await admin.database.rpc("save_project", {
        actor: ids[members[(i + 9) % 10]],
        body,
        vec: await prepareEmbedding(canonicalProject(body), provider, old),
        expected_revision: existing?.revision ?? 0,
      }),
    );
    must(
      await admin.database
        .from("projects")
        .update({ is_demo: true })
        .eq("id", id),
    );
  }
  console.log(
    `Seeded ${taxonomy.length} skills, ${members.length} demo members, and ${ideas.length} demo projects. Provider: ${provider.name}.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
