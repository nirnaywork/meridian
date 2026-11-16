import "server-only";
import { readFile,readdir,stat,realpath } from "node:fs/promises";
import { join } from "node:path";
import { embeddingProvider,selectionState } from "../matching/select";
import { modelRoot,verifyFiles } from "../matching/model-files";
import { transformersEnvironment } from "../matching/minilm";
import { cosine } from "../matching/provider";
export async function publicEmbeddingHealth(){
 let available=true;try{await embeddingProvider()}catch{available=false;}
 const state=selectionState(),files=await verifyFiles();
 let remoteModelsAllowed:boolean|null=null;
 try{remoteModelsAllowed=(await transformersEnvironment()).allowRemoteModels}catch{}
 return {body:{...state,modelFilesPresent:files.present,checksums:files.checksums,remoteModelsAllowed},available};
}
let smoke:{at:number;promise:Promise<unknown>}|undefined;
export function smokeTest(){
 if(!smoke||Date.now()-smoke.at>60000)smoke={at:Date.now(),promise:(async()=>{
  try{const p=await embeddingProvider();const [a,b,c]=await Promise.all(["A student builds a React web application","Developing websites with React and TypeScript","Designing a chemical distillation column"].map(t=>p.embed(t)));
  const norm=Math.hypot(...a),nonZero=a.filter(x=>x!==0).length,related=cosine(a,b),unrelated=cosine(a,c);
  return {passed:a.length===384&&Math.abs(norm-1)<1e-5&&related>unrelated&&(p.name!=="minilm"||nonZero>=380),dims:a.length,norm,nonZeroDimensions:nonZero,relatedPairBeatsUnrelated:related>unrelated,checkedAt:new Date().toISOString()};
  }catch(error){return {passed:false,error:(error as Error).message};}
 })()};return smoke.promise;
}
async function packageVersion(name:string){try{return JSON.parse(await readFile(join(process.cwd(),"node_modules",name,"package.json"),"utf8")).version}catch{return "UNKNOWN";}}
export async function bundleInventory(){
 const root=process.cwd(),seen=new Set<string>();let bytes=0,files=0,modelBytes=0,nativeBytes=0;const nativeFiles:{path:string;bytes:number}[]=[];
 const walk=async(path:string)=>{for(const e of await readdir(path,{withFileTypes:true})){const p=join(path,e.name);try{const real=await realpath(p);if(seen.has(real))continue;seen.add(real);const s=await stat(real);if(s.isDirectory()){await walk(real)}else{bytes+=s.size;files++;if(real.includes("/models/")||real.includes("\\models\\"))modelBytes+=s.size;if(/onnxruntime-node.*\.(node|so[.\d]*|dylib|dll)$/.test(real)){nativeBytes+=s.size;nativeFiles.push({path:real,bytes:s.size});}}}catch{}}};
 try{await walk(root);return {method:"deduplicated regular files visible under process.cwd() (runtime bundle footprint)",root,bytes,files,modelBytes,nativeBytes,nativeFiles};}catch(error){return {error:(error as Error).message};}
}
export async function detailedEmbeddingHealth(){const health=await publicEmbeddingHealth();let environment:unknown;try{const env=await transformersEnvironment();environment={allowLocalModels:env.allowLocalModels,localModelPath:env.localModelPath,allowRemoteModels:env.allowRemoteModels,useFSCache:env.useFSCache}}catch(error){environment={error:(error as Error).message}}return {...health.body,node:process.version,platform:process.platform,architecture:process.arch,onnxruntimeNode:await packageVersion("onnxruntime-node"),transformers:await packageVersion("@huggingface/transformers"),modelPath:modelRoot(),environment,smoke:await smokeTest(),bundle:await bundleInventory()};}
