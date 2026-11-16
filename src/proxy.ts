import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@insforge/sdk/ssr/middleware";
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });
  return response;
}
export const config = {
  matcher: [
    "/",
    "/sign-in",
    "/start",
    "/api/session",
    "/api/embeddings/:path*",
    "/api/projects/:path*",
    "/projects/:path*",
    "/onboarding",
    "/profile",
    "/applications",
    "/invitations",
    "/my-projects",
    "/api/data/:path*",
    "/api/actions",
  ],
};
