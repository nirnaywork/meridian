import { mkdirSync, writeFileSync } from "node:fs";
import { hashedProvider, cosine } from "../src/lib/matching/provider";
import { miniLMProvider } from "../src/lib/matching/minilm";
import { canonicalProfile, canonicalRole } from "../src/lib/matching/canonical";
import { score } from "../src/lib/matching/config";
export const domains = [
  ["Frontend Developer", "React", "TypeScript", "CSS"],
  ["ML Engineer", "Python", "Machine Learning", "PyTorch"],
  ["UX Designer", "Figma", "UX Design", "Prototyping"],
  ["Data Analyst", "SQL", "Pandas", "Data Visualization"],
  ["Mobile Developer", "Flutter", "Dart", "Mobile UX"],
  ["DevOps Engineer", "Docker", "Linux", "CI/CD"],
  ["Game Developer", "Unity", "C#", "Game Design"],
  ["IoT Engineer", "Arduino", "C++", "Sensors"],
  ["Content Strategist", "Copywriting", "Content Strategy", "Editing"],
  ["Product Manager", "Product Management", "User Stories", "Roadmapping"],
];
async function main() {
  const reports = [];
  for (const provider of process.argv.includes("--all")
    ? [hashedProvider, miniLMProvider]
    : [hashedProvider]) {
    const records: Array<{
      member: string;
      role: string;
      relevant: boolean;
      cosine: number;
      coverage: number;
      cosine_score: number;
      final_score: number;
      band: string;
    }> = [];
    for (let i = 0; i < domains.length; i++) {
      for (const relevant of [true, false]) {
        const member = domains[relevant ? i : (i + 3) % domains.length],
          role = domains[i];
        const a = await provider.embed(
          canonicalProfile({
            headline: member[0],
            skills: member
              .slice(1)
              .map((name) => ({ name, proficiency: "advanced" })),
          }),
        );
        const b = await provider.embed(
          canonicalRole(
            {
              title: role[0],
              description: `Build a student project using ${role.slice(1).join(", ")}.`,
              skills: role
                .slice(1)
                .map((name) => ({ name, importance: "required" })),
            },
            "Student collaboration",
          ),
        );
        const c = cosine(a, b);
        records.push({
          member: member[0],
          role: role[0],
          relevant,
          ...score(c, relevant ? 1 : 0, provider.name as "hashed" | "minilm"),
        });
      }
    }
    const distribution = (label: boolean) => {
      const v = records
        .filter((x) => x.relevant === label)
        .map((x) => x.cosine)
        .sort((a, b) => a - b);
      return {
        min: v[0],
        median: (v[4] + v[5]) / 2,
        max: v.at(-1),
        mean: v.reduce((a, b) => a + b, 0) / v.length,
      };
    };
    reports.push({
      provider: provider.name,
      version: provider.version,
      relevant: distribution(true),
      irrelevant: distribution(false),
      records,
    });
  }
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/calibration.json", JSON.stringify(reports, null, 2));
  console.log(
    JSON.stringify(
      reports.map(({ records, ...r }) => ({ ...r, pairs: records.length })),
      null,
      2,
    ),
  );
}
if (process.argv[1]?.includes("calibrate"))
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
