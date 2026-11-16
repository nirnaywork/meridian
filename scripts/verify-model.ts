import assert from "node:assert/strict";
import { miniLMProvider, offlineOptions,transformersEnvironment,MAX_SEQUENCE_LENGTH } from "../src/lib/matching/minilm";
import { cosine } from "../src/lib/matching/provider";
assert.equal(offlineOptions.allowRemoteModels, false);
const [a, b, c] = await Promise.all(
  [
    "A student builds a React web application",
    "Developing websites with React and TypeScript",
    "Designing a chemical distillation column",
  ].map((t) => miniLMProvider.embed(t)),
);
assert.equal(a.length, 384);
assert(a.filter(n=>n!==0).length>=380);
assert.equal((await transformersEnvironment()).allowRemoteModels,false);
const traced=await miniLMProvider.generate!('React '.repeat(600));assert.equal(traced.details.max_sequence_length,MAX_SEQUENCE_LENGTH);assert.equal(traced.details.token_count,MAX_SEQUENCE_LENGTH);assert.equal(traced.details.truncated,true);
assert(Math.abs(Math.hypot(...a) - 1) < 1e-5);
assert(cosine(a, b) > cosine(a, c));
console.log(
  "Offline native ONNX: dimensions, norm and semantic ordering passed",
);
