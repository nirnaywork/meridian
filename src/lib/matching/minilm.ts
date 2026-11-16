import type { EmbeddingProvider } from "./provider";
let extractor:
  | Promise<import("@huggingface/transformers").FeatureExtractionPipeline>
  | undefined;
export const miniLMProvider: EmbeddingProvider = {
  name: "minilm",
  version: "all-MiniLM-L6-v2-751bff37-q8-v1",
  dims: 384,
  async embed(text) {
    if (!extractor)
      extractor = (async () => {
        const { pipeline, env } = await import("@huggingface/transformers");
        env.cacheDir = process.env.MODEL_CACHE_DIR ?? ".cache/models";
        env.allowRemoteModels = process.env.MODEL_LOCAL_ONLY !== "true";
        const featurePipeline = pipeline as (
          task: "feature-extraction",
          model: string,
          options: { dtype: "q8"; revision: string },
        ) => Promise<
          import("@huggingface/transformers").FeatureExtractionPipeline
        >;
        return featurePipeline(
          "feature-extraction",
          "Xenova/all-MiniLM-L6-v2",
          { dtype: "q8", revision: "751bff37182d3f1213fa05d7196b954e230abad9" },
        );
      })();
    try {
      const output = await (
        await extractor
      )(text, { pooling: "mean", normalize: true });
      return Array.from(output.data as Float32Array);
    } catch (error) {
      extractor = undefined;
      throw error;
    }
  },
};
