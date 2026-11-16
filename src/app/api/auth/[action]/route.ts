import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAuthActions } from "@insforge/sdk/ssr";
import { z } from "zod";
import { createHash } from "node:crypto";
import { email, password } from "@/lib/validation";
import { authMessage } from "@/lib/auth-errors";
import { userClient, rate, HttpError } from "@/lib/server/db";
import { failure, jsonBody, sameOrigin } from "@/lib/server/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(request);
    const { action } = await params;
    const input = await jsonBody(request);
    const auth = createAuthActions({ cookies: await cookies() });
    const db = await userClient();
    const ip =
      request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("x-forwarded-for")?.split(",")[0] ??
      "local";
    await rate(
      "auth-ip:" + createHash("sha256").update(ip).digest("hex"),
      30,
      300,
    );
    if (action === "sign-out") {
      const result = await auth.signOut();
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }
    const address = email.parse(input.email);
    const key = createHash("sha256").update(address).digest("hex");
    await rate(
      "auth:" + action + ":" + key,
      action === "resend" || action === "forgot" ? 1 : 10,
      action === "resend" || action === "forgot" ? 60 : 300,
    );
    let result;
    if (action === "sign-up")
      result = await auth.signUp({
        email: address,
        password: password.parse(input.password),
      });
    else if (action === "sign-in")
      result = await auth.signInWithPassword({
        email: address,
        password: z.string().min(1).max(128).parse(input.password),
      });
    else if (action === "verify")
      result = await auth.verifyEmail({
        email: address,
        otp: z
          .string()
          .regex(/^\d{6}$/, "Enter all six digits")
          .parse(input.code),
      });
    else if (action === "resend")
      result = await db.auth.resendVerificationEmail({ email: address });
    else if (action === "forgot")
      result = await db.auth.sendResetPasswordEmail({ email: address });
    else if (action === "reset") {
      const newPassword = password.parse(input.password);
      const token = await db.auth.exchangeResetPasswordToken({
        email: address,
        code: z
          .string()
          .regex(/^\d{6}$/, "Enter all six digits")
          .parse(input.code),
      });
      if (token.error || !token.data)
        throw token.error ?? new Error("Code expired");
      result = await db.auth.resetPassword({
        newPassword,
        otp: token.data.token,
      });
    } else throw new HttpError("Unknown auth action", 404);
    if (result.error) {
      if (action === "sign-in" && result.error.statusCode === 403)
        return NextResponse.json(
          { verify: true, message: "Verify your email to continue." },
          { status: 403 },
        );
      throw new HttpError(
        authMessage(result.error.message, result.error.statusCode),
        result.error.statusCode,
      );
    }
    return NextResponse.json({ ok: true, verify: action === "sign-up" });
  } catch (e) {
    return failure(e);
  }
}
