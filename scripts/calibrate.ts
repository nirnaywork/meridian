import { mkdirSync, writeFileSync,readFileSync } from "node:fs";
import {calibrationReport} from './fit-calibration';
import { hashedProvider, cosine } from "../src/lib/matching/provider";
import { miniLMProvider } from "../src/lib/matching/minilm";
import { canonicalProfile, canonicalRole } from "../src/lib/matching/canonical";
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
  ["FPGA Engineer", "Verilog", "FPGA", "VHDL"],
  [
    "Power Engineer",
    "Power Systems: protection design",
    "Electrical Machines: testing",
  ],
  [
    "Mechanical Designer",
    "Mechanical Design: CAD modeling",
    "CAD and Simulation: stress analysis",
  ],
  ["Product Manager", "Product Management", "User Stories", "Roadmapping"],
];
async function main() {
  if(process.argv.includes('--from-report')){finish(JSON.parse(readFileSync('docs/calibration.json','utf8')));return;}
  const reports = [];
  for (const provider of process.argv.includes("--all")
    ? [hashedProvider, miniLMProvider]
    : [hashedProvider]) {
    const records: Array<{
      member: string;
      role: string;
      relevant: boolean;
      cosine: number;
    }> = [];
    for (let i = 0; i < domains.length; i++) {
      for (const relevant of [true, false]) {
        const member = domains[relevant ? i : (i + 3) % domains.length],
          role = domains[i];
        const a = await provider.embed(
          canonicalProfile({
            headline: member[0],
            domains: [member[0]],
            skills: member
              .slice(1)
              .map((name) => ({ name, proficiency: "advanced" })),
          }),
        );
        const b = await provider.embed(
          canonicalRole(
            {
              title: role[0],
              domains: [role[0]],
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
          cosine: c,
        });
      }
    }
    const semanticPairs:[string,string,boolean][]=[
      ['Python, machine learning, PyTorch','Deep learning engineer, TensorFlow, neural networks',true],
      ['Python, machine learning, PyTorch','Graphic designer, Figma, Photoshop',false],
      ['React, Node.js, MongoDB','Full stack web developer, Express, AWS',true],
      ['Verilog, FPGA, VLSI','Frontend developer, React, CSS',false],
      ['Verilog, FPGA timing closure, VLSI','Digital hardware engineer, RTL synthesis and verification',true],
      ['Power electronics, inverters, electrical machines','Electrical engineer designing motor drives and EV converters',true],
      ['SolidWorks CAD, finite element analysis','Mechanical engineer designing and stress-testing machine components',true],
      ['SolidWorks CAD, finite element analysis','Social media marketing, copywriting, SEO',false],
    ];
    for(const [member,role,relevant] of semanticPairs)records.push({member,role,relevant,cosine:cosine(await provider.embed(member),await provider.embed(role))});
    const distribution = (label: boolean) => {
      const v = records
        .filter((x) => x.relevant === label)
        .map((x) => x.cosine)
        .sort((a, b) => a - b);
      return {
        min: v[0],
        median: v[Math.floor(v.length / 2)],
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
  finish(reports);
}
function finish(reports:any[]){
 const fitted=reports.map(calibrationReport);
 if(process.argv.includes('--write-config'))writeFileSync('src/lib/matching/match-calibration.json',JSON.stringify({calibrationVersion:'role-percent-2026-11-v1',providers:Object.fromEntries(fitted.map(r=>[r.provider,r.selected]))},null,2)+'\n');
 writeFileSync('docs/change5-calibration.json',JSON.stringify(fitted,null,2));
  console.log(
    JSON.stringify(
      fitted.map(({ records, ...r }) => ({ ...r, pairs: records.length })),
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
