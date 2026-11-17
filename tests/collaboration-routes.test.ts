import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
  from: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({
  session: mocks.session,
  rate: mocks.rate,
  adminClient: () => ({ database: { rpc: mocks.adminRpc, from: mocks.from } }),
  checked: (r: any) => {
    if (r.error) throw r.error;
    return r.data;
  },
  HttpError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/matching/select", () => ({ embeddingProvider: mocks.embed }));
import { POST as workspacePost } from "../src/app/api/projects/[id]/workspace/route";
import { POST as metadataPost } from "../src/app/api/profile-metadata/route";
import { failure } from "../src/lib/server/http";
const user = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  project = "10000000-0000-4000-8000-000000000003";
const request = (body: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/action", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: user },
    db: { database: { rpc: mocks.rpc } },
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.adminRpc.mockResolvedValue({ data: { ok: true }, error: null });
});
it("preserves conflict and permission status even when a database wrapper reports 500", () => {
  expect(
    failure({ code: "PT409", statusCode: 500, message: "Task changed" }).status,
  ).toBe(409);
  expect(
    failure({ code: "42501", statusCode: 500, message: "Denied" }).status,
  ).toBe(403);
});
it("rejects cross-origin workspace mutations before accessing session or data", async () => {
  const r = await workspacePost(
    request({ action: "read_chat" }, "https://foreign.test"),
    { params: Promise.resolve({ id: project }) },
  );
  expect(r.status).toBe(403);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.adminRpc).not.toHaveBeenCalled();
});
it("takes workspace actor from the session and strips forged identities", async () => {
  const r = await workspacePost(
    request({ action: "message", id: other, body: " hello ", actor: other }),
    { params: Promise.resolve({ id: project }) },
  );
  expect(r.status).toBe(200);
  expect(mocks.adminRpc).toHaveBeenCalledWith("collaboration_action", {
    actor: user,
    pid: project,
    p_action: { action: "message", id: other, body: "hello" },
  });
});
it("denies inactive users before a privileged mutation", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  const r = await workspacePost(request({ action: "read_chat" }), {
    params: Promise.resolve({ id: project }),
  });
  expect(r.status).toBe(403);
  expect(mocks.adminRpc).not.toHaveBeenCalled();
});
it("rejects invalid message and ticket input without calling mutation RPC", async () => {
  for (const body of [
    { action: "message", id: other, body: " " },
    { action: "ticket", title: "x", description: "x".repeat(4001) },
  ]) {
    const r = await workspacePost(request(body), {
      params: Promise.resolve({ id: project }),
    });
    expect(r.status).toBe(400);
  }
  expect(mocks.adminRpc).not.toHaveBeenCalled();
});
it("writes only the signed-in profile metadata and never calls embedding code", async () => {
  const select = vi
      .fn()
      .mockResolvedValue({ data: [{ id: user }], error: null }),
    eq = vi.fn(() => ({ select })),
    update = vi.fn(() => ({ eq }));
  mocks.from.mockReturnValue({ update });
  const r = await metadataPost(
    request({
      github: "github.com/member",
      visibility: "public",
      id: other,
      headline: "forged source field",
    }),
  );
  expect(r.status).toBe(200);
  expect(eq).toHaveBeenCalledWith("id", user);
  expect(update).toHaveBeenCalledWith({
    links: {
      github: "https://github.com/member",
      linkedin: "",
      website: "",
      custom: [],
    },
    visibility: "public",
  });
  expect(mocks.embed).not.toHaveBeenCalled();
  expect(mocks.adminRpc).not.toHaveBeenCalled();
});
