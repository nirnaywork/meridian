import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import {
  MODEL,
  REVISION,
  MODEL_FILES,
  modelRoot,
  verifyFiles,
} from "../src/lib/matching/model-files";
if ((await verifyFiles()).checksums) {
  console.log("Pinned model checksums verified");
  process.exit(0);
}
const info = await fetch(
  `https://huggingface.co/api/models/${MODEL}/revision/${REVISION}?blobs=true`,
).then((r) => {
  if (!r.ok) throw new Error("Model metadata unavailable");
  return r.json();
});
const files: Record<string, string> = {};
for (const file of MODEL_FILES) {
  const response = await fetch(
    `https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`,
  );
  if (!response.ok) throw new Error(`Download failed: ${file}`);
  const bytes = Buffer.from(await response.arrayBuffer()),
    digest = createHash("sha256").update(bytes).digest("hex");
  const expected = info.siblings.find((s: any) => s.rfilename === file)?.lfs
    ?.sha256;
  if (expected && expected !== digest)
    throw new Error("Hub checksum mismatch: " + file);
  const path = join(modelRoot(), MODEL, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  files[file] = digest;
}
await writeFile(
  join(modelRoot(), "MANIFEST.json"),
  JSON.stringify(
    { model: MODEL, revision: REVISION, license: "Apache-2.0", files },
    null,
    2,
  ),
);
if (!(await verifyFiles()).checksums)
  throw new Error("Post-download checksum verification failed");
console.log("Downloaded and verified five pinned model files");
