import { it, expect } from "vitest";
import { password } from "../src/lib/validation";
import { authMessage } from "../src/lib/auth-errors";
it("enforces the same password policy used by InsForge", () => {
  for (const s of ["short", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"])
    expect(password.safeParse(s).success).toBe(false);
  expect(password.safeParse("MyPassphrase42").success).toBe(true);
});
it("gives actionable code errors", () => {
  expect(authMessage("invalid otp", 400)).toContain("six digits");
  expect(authMessage("expired", 400)).toContain("Request a new code");
  expect(authMessage("limit", 429)).toContain("Too many attempts");
});
