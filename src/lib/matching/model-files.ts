import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export const MODEL = "Xenova/all-MiniLM-L6-v2";
export const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
export const MODEL_FILES = [
  "onnx/model_quantized.onnx",
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
];
export const modelRoot = () =>
  resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.MODEL_DIR ?? "models",
  );
export async function verifyFiles(root = modelRoot()) {
  try {
    const manifest = JSON.parse(
      await readFile(join(root, "MANIFEST.json"), "utf8"),
    );
    if (manifest.revision !== REVISION) throw new Error("Wrong revision");
    for (const file of MODEL_FILES) {
      const bytes = await readFile(join(root, MODEL, file));
      if (
        createHash("sha256").update(bytes).digest("hex") !==
        manifest.files[file]
      )
        throw new Error("Checksum mismatch: " + file);
    }
    return { present: true, checksums: true, error: null };
  } catch (error) {
    return {
      present: false,
      checksums: false,
      error: (error as Error).message,
    };
  }
}
