import { createRefreshAuthRouter } from "@insforge/sdk/ssr";
import { failure, sameOrigin } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    return createRefreshAuthRouter().POST(request);
  } catch (e) {
    return failure(e);
  }
}
