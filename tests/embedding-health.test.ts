import { beforeEach,afterEach,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({environment:{allowLocalModels:true,allowRemoteModels:false,localModelPath:"/models/",useFSCache:false},state:{provider:"hashed",version:"domains-tfidf-v4",model:"Feature-hashed TF-IDF",dims:384,selectionReason:"configured",lastLoadError:null}}));
vi.mock("../src/lib/matching/select",()=>({embeddingProvider:vi.fn(async()=>({name:"hashed"})),selectionState:()=>mocks.state}));
vi.mock("../src/lib/matching/minilm",()=>({transformersEnvironment:async()=>mocks.environment}));
vi.mock("../src/lib/matching/model-files",()=>({modelRoot:()=>"/models",verifyFiles:async()=>({present:true,checksums:true})}));
beforeEach(()=>{mocks.environment.allowRemoteModels=false;});
afterEach(()=>vi.unstubAllEnvs());
it("public health reports the selected model and the live remote-model setting",async()=>{
 const {publicEmbeddingHealth}=await import("../src/lib/server/embedding-health");
 const first=await publicEmbeddingHealth();expect(first.body.model).toBe("Feature-hashed TF-IDF");expect(first.body.remoteModelsAllowed).toBe(false);
 mocks.environment.allowRemoteModels=true;expect((await publicEmbeddingHealth()).body.remoteModelsAllowed).toBe(true);
});
it("detail rejects a missing or incorrect token before running native inference",async()=>{
 vi.stubEnv("HEALTH_TOKEN","unit-test-health-token");
 const {GET}=await import("../src/app/api/health/embedding/detail/route");
 expect((await GET(new Request("https://example.test/api/health/embedding/detail"))).status).toBe(401);
 expect((await GET(new Request("https://example.test/api/health/embedding/detail",{headers:{"x-health-token":"wrong"}}))).status).toBe(401);
});
