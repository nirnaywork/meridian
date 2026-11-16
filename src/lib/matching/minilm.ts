import { MODEL, verifyFiles, modelRoot } from "./model-files";
import type { EmbeddingProvider } from "./provider";
import { EMBEDDING_VERSIONS } from "./identity";
export const offlineOptions = {
  allowLocalModels: true,
  allowRemoteModels: false,
} as const;
export const MAX_SEQUENCE_LENGTH=256;
let extractor: Promise<any> | undefined;
let environment:Promise<any>|undefined;
export async function transformersEnvironment(){
 environment??=(async()=>{const {env}=await import("@huggingface/transformers");
 Object.assign(env,offlineOptions,{localModelPath:modelRoot()+"/",useFSCache:false});return env;})();
 return environment;
}
export async function loadModel() {
  if (!extractor)
    extractor = (async () => {
      const status = await verifyFiles();
      if (!status.checksums) throw new Error(status.error ?? "Missing model");
      const { pipeline } = await import("@huggingface/transformers");
      const env=await transformersEnvironment();
      Object.assign(env, offlineOptions, {
        localModelPath: modelRoot() + "/",
        useFSCache: false,
      });
      const pipe=await pipeline("feature-extraction", MODEL, {
        dtype: "q8",
        local_files_only: true,
      });
      pipe.tokenizer.model_max_length=MAX_SEQUENCE_LENGTH;
      return pipe;
    })();
  return extractor;
}
export const miniLMProvider: EmbeddingProvider = {
  name: "minilm",
  version: EMBEDDING_VERSIONS.minilm,
  dims: 384,
  async embed(text) {
    return (await this.generate!(text)).embedding;
  },
  async generate(text) {
    const pipe = await loadModel();
    const full = pipe.tokenizer(text, { truncation: false });
    const input = pipe.tokenizer(text, { truncation: true, max_length: MAX_SEQUENCE_LENGTH });
    const ids = Array.from(input.input_ids.data, Number);
    const output = await pipe(text, { pooling: "mean", normalize: false });
    const raw = Array.from(output.data, Number),
      norm = Math.hypot(...raw);
    return {
      embedding: raw.map((x) => x / norm),
      details: {
        tokens: pipe.tokenizer.model.convert_ids_to_tokens(ids),
        token_ids: ids,
        token_count: ids.length,
        original_token_count: full.input_ids.size,
        truncated: full.input_ids.size > ids.length,
        max_sequence_length: MAX_SEQUENCE_LENGTH,
        norm_before: norm,
        special_tokens: ["[CLS]", "[SEP]"],
      },
    };
  },
};
