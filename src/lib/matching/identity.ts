export const EMBEDDING_DIMS=384;
export const EMBEDDING_VERSIONS={hashed:"domains-tfidf-v5",minilm:"domains-minilm-751bff37-q8-v3"} as const;
export function configuredProvider(){
 const value=process.env.EMBEDDING_PROVIDER;
 if(value!=="minilm"&&value!=="hashed")throw new Error(`Meridian: EMBEDDING_PROVIDER must be explicitly minilm or hashed; received ${value===undefined?"<missing>":JSON.stringify(value)}`);
 return value;
}
