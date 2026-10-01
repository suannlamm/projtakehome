import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callApi as call } from "./helpers";

const getUserId = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getUserId }));
// The auth middleware's one database query: set to null to simulate a user who hasn't onboarded yet.
const username = vi.hoisted(() => ({ value: "user-1" as string | null }));
vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => [{ username: username.value }] }) }) } }));

const endpoints: [string, string][] = [
  ["GET", "/feed"],
  ["GET", "/search?q=dune"],
  ["PUT", "/watchlist/27205"],
  ["DELETE", "/watchlist/27205"],
  ["PUT", "/reviews/27205"],
  ["DELETE", "/reviews/27205"],
  ["PUT", "/follows/sam"],
  ["DELETE", "/follows/sam"],
  ["PUT", "/followers/sam"],
  ["DELETE", "/followers/sam"],
  ["GET", "/users?q=sam"],
  ["GET", "/users/sam"],
  ["PATCH", "/profile"],
  ["DELETE", "/profile"],
  ["POST", "/recommendations"],
];

describe("signed out", () => {
  beforeEach(() => getUserId.mockResolvedValue(null));

  it.each(endpoints)("%s /api%s returns 401", async (method, path) => {
    expect((await call(method, path)).status).toBe(401);
  });
});

// Each of these is rejected before the route touches the database.
describe("signed in, malformed requests", () => {
  beforeEach(() => getUserId.mockResolvedValue("user-1"));

  it.each([
    ["rating above 10", "PUT", "/reviews/27205", { rating: 11 }, 400],
    ["fractional rating", "PUT", "/reviews/27205", { rating: 7.5 }, 400],
    ["missing rating", "PUT", "/reviews/27205", { body: "Great" }, 400],
    ["non-numeric film id", "PUT", "/watchlist/abc", undefined, 404],
    ["film id too long for an integer", "PUT", "/watchlist/1234567890", undefined, 404],
    ["empty profile update", "PATCH", "/profile", {}, 400],
    ["handle too short", "PATCH", "/profile", { username: "ab" }, 400],
    ["handle with spaces", "PATCH", "/profile", { username: "no spaces" }, 400],
    ["privacy flag that isn't a boolean", "PATCH", "/profile", { isPrivate: "yes" }, 400],
    ["one-character member search", "GET", "/users?q=a", undefined, 400],
    ["one-character film search", "GET", "/search?q=a", undefined, 400],
    ["taste profile prompt over 300 characters", "POST", "/recommendations", { prompt: "x".repeat(301) }, 400],
  ] as const)("%s", async (_, method, path, body, status) => {
    expect((await call(method, path, body)).status).toBe(status);
  });

  it("explains a missing rating instead of a generic error", async () => {
    const res = await call("PUT", "/reviews/27205", { body: "Great" });
    expect(await res.json()).toEqual({ error: "Pick a rating from 1 to 10 before saving" });
  });
});

// Onboarding (picking a unique handle) isn't optional: every route but /profile itself needs one.
describe("signed in, no handle yet", () => {
  beforeEach(() => {
    getUserId.mockResolvedValue("no-handle-user");
    username.value = null;
  });
  afterEach(() => (username.value = "user-1"));

  it.each(endpoints.filter(([, path]) => path !== "/profile"))("%s /api%s returns 403", async (method, path) => {
    expect((await call(method, path)).status).toBe(403);
  });

  it.each([
    ["PATCH", "/profile"],
    ["DELETE", "/profile"],
  ])("%s /api/profile is still reachable", async (method, path) => {
    expect((await call(method, path)).status).not.toBe(403);
  });
});

// TMDB isn't retried; the user gets a 502 with a message saying what's wrong.
describe("TMDB unavailable", () => {
  beforeEach(() => {
    getUserId.mockResolvedValue("user-1");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["down", () => Promise.reject(new TypeError("fetch failed"))],
    ["rate-limiting", () => Promise.resolve(new Response(null, { status: 429 }))],
  ])("returns 502 with a readable message when TMDB is %s", async (_, fetch) => {
    vi.stubGlobal("fetch", fetch);
    const res = await call("GET", "/search?q=dune");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/TMDB/);
  });
});
