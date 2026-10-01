import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { db } from "@/db";
import { movies, profiles } from "@/db/schema";
import { callApi } from "./helpers";

// List changes against the real schema in memory. TMDB is reached through a stubbed fetch.
const getUserId = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getUserId }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/db", async () => ({ db: await (await import("./db")).createTestDb() }));

const userId = "00000000-0000-4000-8000-000000000001";
const heat = { id: 949, title: "Heat", poster_path: null, release_date: "1995-12-15", overview: "", vote_average: 8, genres: [] };

beforeAll(async () => {
  await db.insert(authUsers).values({ id: userId });
  await db.update(profiles).set({ username: "ana" }).where(eq(profiles.id, userId));
});
beforeEach(() => {
  getUserId.mockResolvedValue(userId);
  revalidateTag.mockReset();
  vi.stubGlobal("fetch", async () => Response.json(heat));
});
afterEach(() => vi.unstubAllGlobals());

it("records when a film's details were synced from TMDB", async () => {
  const before = Date.now();
  expect((await callApi("PUT", "/watchlist/949")).status).toBe(204);
  const [row] = await db.select({ syncedAt: movies.syncedAt }).from(movies).where(eq(movies.id, 949));
  expect(row.syncedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
});

it.each([
  ["adding a film", "PUT", "/watchlist/949", undefined],
  ["rating a film", "PUT", "/reviews/949", { rating: 8 }],
  ["deleting a rating", "DELETE", "/reviews/949", undefined],
  ["removing a film", "DELETE", "/watchlist/949", undefined],
] as const)("clears the cached home page row after %s", async (_, method, path, body) => {
  expect((await callApi(method, path, body)).status).toBe(204);
  expect(revalidateTag).toHaveBeenCalledWith(`home:${userId}`, { expire: 0 });
});
