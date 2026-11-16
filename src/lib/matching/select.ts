import { hashedProvider } from "./provider";
export async function embeddingProvider() {
  if (process.env.EMBEDDING_PROVIDER === "minilm")
    return (await import("./minilm")).miniLMProvider;
  if (
    process.env.EMBEDDING_PROVIDER &&
    process.env.EMBEDDING_PROVIDER !== "hashed"
  )
    throw new Error("Unknown EMBEDDING_PROVIDER");
  return hashedProvider;
}
