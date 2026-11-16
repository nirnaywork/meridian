import { redirect } from "next/navigation";
import { userClient } from "@/lib/server/db";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export default async function AuthPage({
  params,
}: {
  params: Promise<{ authPage: string }>;
}) {
  const { authPage } = await params;
  if (authPage === "sign-in") {
    const { data } = await (await userClient()).auth.getCurrentUser();
    if (data.user?.emailVerified) redirect("/projects");
  }
  if (
    ![
      "sign-in",
      "sign-up",
      "verify",
      "forgot-password",
      "reset-password",
    ].includes(authPage)
  )
    notFound();
  return (
    <Suspense fallback={<div className="empty">Loading…</div>}>
      <AuthForm mode={authPage} />
    </Suspense>
  );
}
