import { hashedProvider,type EmbeddingProvider } from "./provider";
import { configuredProvider,EMBEDDING_VERSIONS } from "./identity";
export class EmbeddingUnavailableError extends Error {status=503;constructor(){super("Embedding service unavailable, please retry");}}
let selection:Promise<EmbeddingProvider>|undefined;
let state:{provider:string|null;version:string|null;model:string|null;dims:number;selectionReason:string;lastLoadError:string|null}={provider:null,version:null,model:null,dims:384,selectionReason:"configured",lastLoadError:null};
export function selectionState(){return {...state};}
export async function embeddingProvider(){
 const configured=configuredProvider();
 if(!selection){
  state={provider:configured,version:EMBEDDING_VERSIONS[configured],model:configured==="minilm"?"Xenova/all-MiniLM-L6-v2":"Feature-hashed TF-IDF",dims:384,selectionReason:"configured",lastLoadError:null};
  selection=(async()=>{
   try{
    if(configured==="hashed"){console.info("Meridian: embedding provider explicitly configured: hashed");return hashedProvider;}
    const {miniLMProvider,loadModel}=await import("./minilm");await loadModel();state.selectionReason="loaded";console.info("Meridian: offline MiniLM loaded",miniLMProvider.version);
    const protect=async<T>(fn:()=>Promise<T>)=>{try{return await fn()}catch(error){state.selectionReason="error";state.lastLoadError=(error as Error).message;console.error("Meridian: MiniLM embedding failed",error);throw new EmbeddingUnavailableError();}};
    return {...miniLMProvider,embed:(text:string)=>protect(()=>miniLMProvider.embed(text)),generate:(text:string)=>protect(()=>miniLMProvider.generate!(text))};
   }catch(error){state.selectionReason="error";state.lastLoadError=(error as Error).message;console.error("Meridian: configured embedding provider failed to load",error);throw new EmbeddingUnavailableError();}
  })();
 }
 return selection;
}
