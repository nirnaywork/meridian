import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canTransition,
  transitions,
  projectStatuses,
  isReadOnly,
  normalizeLink,
  profileMetadataSchema,
  messageSchema,
  shouldNotify,
  publicProfileColumns,
} from "../src/lib/collaboration";
describe("collaboration rules", () => {
  it("allows only explicit lifecycle transitions and terminal archives", () => {
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("completed", "open")).toBe(false);
    expect(canTransition("completed", "archived")).toBe(true);
    expect(transitions.archived).toEqual([]);
    for (const s of ["completed", "cancelled", "archived"])
      expect(isReadOnly(s)).toBe(true);
    expect(isReadOnly("closed")).toBe(false);
  });
  it("keeps the database state map exactly aligned with the shared module", () => {
    const sql = readFileSync(
      "migrations/20261118010000_collaboration-foundation.sql",
      "utf8",
    );
    const map = JSON.parse(sql.match(/allowed jsonb='([^']+)'/)![1]);
    expect(map).toEqual(transitions);
    expect(Object.keys(map)).toEqual([...projectStatuses]);
  });
  it("normalizes public https links and validates platform hosts", () => {
    expect(normalizeLink(" github.com/member ", "github")).toBe(
      "https://github.com/member",
    );
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "http://example.com",
      "https://user:password@example.com",
      "https://localhost",
      "https://github.com.evil.test",
    ])
      expect(() => normalizeLink(value, "github")).toThrow();
    expect(normalizeLink("linkedin.com/in/member", "linkedin")).toBe(
      "https://linkedin.com/in/member",
    );
    expect(profileMetadataSchema.parse({})).toEqual({
      github: "",
      linkedin: "",
      website: "",
      custom: [],
      visibility: "private",
    });
    expect(
      profileMetadataSchema.safeParse({
        custom: Array(4).fill({ label: "a", url: "https://example.com" }),
      }).success,
    ).toBe(false);
  });
  it("bounds plain text messages", () => {
    expect(messageSchema.parse(" hello ")).toBe("hello");
    for (const s of ["", " ".repeat(9), "x".repeat(2001)])
      expect(messageSchema.safeParse(s).success).toBe(false);
  });
  it("skips self notifications",()=>{
    expect(shouldNotify("a", "a")).toBe(false);
    expect(shouldNotify("a", "b")).toBe(true);
    expect(shouldNotify(null, "b")).toBe(false);
  });
  it("projects public profile fields without private identifiers or matching data", () => {
    for (const privateField of [
      "email",
      "avatar_key",
      "embedding",
      "trace",
      "source_hash",
      "cosine",
      "match_percent",
    ])
      expect(publicProfileColumns.split(",")).not.toContain(privateField);
    expect(publicProfileColumns).toContain("links");
  });
});
