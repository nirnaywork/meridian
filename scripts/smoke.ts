import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const origin = process.env.TEST_APP_URL ?? "https://tyhutf3c.insforge.site";
const user = JSON.parse(readFileSync(".cache/qa-login.json", "utf8"));
const results: string[] = [];
const pass = (message: string) => { results.push(message); console.log("PASS " + message); };
const landing = await fetch(origin);
assert.equal(landing.status, 200);
assert.match(await landing.text(), /Find your people/);
pass("Hosted landing renders");
const login = await fetch(origin + "/api/auth/sign-in", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ email: user.email, password: user.password }),
});
assert.equal(login.status, 200, await login.clone().text());
const cookies = login.headers.getSetCookie();
assert(cookies.some(c => /HttpOnly/i.test(c) && /Secure/i.test(c)));
const headers = { Cookie: cookies.map(c => c.split(";")[0]).join("; ") };
pass("Hosted sign-in sets secure HTTP-only refresh cookies");
const start = await fetch(origin + "/start", { headers, redirect: "manual" });
if (start.status === 307) assert.equal(start.headers.get("location"), "/my-projects");
else {
  assert.equal(start.status, 200);
  assert.match(await start.text(), /NEXT_REDIRECT;replace;\/my-projects;307/);
}
pass("Lead-only intent selects My Projects after login");
const feed = await fetch(origin + "/api/data/feed", { headers });
assert.equal(feed.status, 200, await feed.clone().text());
const payload = await feed.json();
const rows = payload.data ?? payload;
assert(rows.length > 0);
assert(rows[0].open_roles.length > 0);
assert(rows.every((p: any) => p.breakdown.model === "hashed"));
assert(rows.every((p: any) => p.breakdown.final_score >= 0 && p.breakdown.final_score <= 100));
pass("Hosted API returns stored-vector matches and all open roles");
const detail = await fetch(origin + "/api/data/project?id=" + rows[0].id, { headers });
assert.equal(detail.status, 200);
pass("Hosted project details load with the authenticated session");
assert.equal((await fetch(origin + "/api/data/feed")).status, 401);
pass("Hosted protected API rejects anonymous access");
const signout = await fetch(origin + "/api/auth/sign-out", { method: "POST", headers: { ...headers, "Content-Type": "application/json", Origin: origin }, body: "{}" });
assert.equal(signout.status, 200);
pass("Hosted sign-out succeeds");
writeFileSync("docs/production-smoke.json", JSON.stringify({ date: new Date().toISOString(), origin, results }, null, 2));
