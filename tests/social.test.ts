import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { db } from "@/db";
import { follows, movies, profiles, reviews, watchlist } from "@/db/schema";
import { callApi } from "./helpers";

// The social rules, checked against the real schema and queries in an in-memory Postgres.
const getUserId = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getUserId }));
vi.mock("@/db", async () => ({ db: await (await import("./db")).createTestDb() }));
// TMDB's film search finds both seeded films; nothing else here calls TMDB.
vi.mock("@/lib/tmdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb")>()),
  tmdb: async (path: string) => ({
    results: path === "/search/movie" ? [1, 2].map((id) => ({ id, title: `Film ${id}`, poster_path: null, release_date: "" })) : [],
  }),
}));

// ana is the viewer. ben, cat, eve and gus are public, dee is private, zed hasn't picked a handle.
const ids = {
  ana: "00000000-0000-4000-8000-000000000001",
  ben: "00000000-0000-4000-8000-000000000002",
  cat: "00000000-0000-4000-8000-000000000003",
  dee: "00000000-0000-4000-8000-000000000004",
  eve: "00000000-0000-4000-8000-000000000005",
  gus: "00000000-0000-4000-8000-000000000006",
  zed: "00000000-0000-4000-8000-000000000007",
};
type Name = keyof typeof ids;

// Sends a request as the given member.
const as = (name: Name) => {
  getUserId.mockResolvedValue(ids[name]);
  return callApi;
};
const json = async (res: Response | Promise<Response>) => (await res).json();

beforeAll(async () => {
  await db.insert(authUsers).values(Object.values(ids).map((id) => ({ id })));
  for (const [name, id] of Object.entries(ids)) {
    if (name === "zed") continue;
    await db.update(profiles).set({ username: name, isPrivate: name === "dee" }).where(eq(profiles.id, id));
  }
  await db.insert(movies).values([
    { id: 1, title: "Heat" },
    { id: 2, title: "Alien" },
  ]);
  const watched = (name: Name, movieId: number) => ({ userId: ids[name], movieId, watchedAt: new Date() });
  await db.insert(watchlist).values([watched("ben", 1), watched("ben", 2), watched("cat", 2), watched("dee", 1), watched("gus", 1)]);
  await db.insert(reviews).values([
    { userId: ids.ben, movieId: 1, rating: 8 },
    { userId: ids.ben, movieId: 2, rating: 3, isPublic: false },
    { userId: ids.cat, movieId: 2, rating: 9 },
  ]);
});

beforeEach(() => db.delete(follows));

const followRows = () => db.select().from(follows);

describe("following", () => {
  it("is idempotent: following or unfollowing twice leaves one row, then none", async () => {
    expect((await as("ana")("PUT", "/follows/ben")).status).toBe(204);
    expect((await as("ana")("PUT", "/follows/BEN")).status).toBe(204);
    expect(await followRows()).toHaveLength(1);

    expect((await as("ana")("DELETE", "/follows/ben")).status).toBe(204);
    expect((await as("ana")("DELETE", "/follows/ben")).status).toBe(204);
    expect(await followRows()).toHaveLength(0);
  });

  it("can't target yourself, however the handle is typed", async () => {
    for (const handle of ["ana", "ANA"]) {
      const res = await as("ana")("PUT", `/follows/${handle}`);
      expect(res.status).toBe(400);
    }
    expect(await followRows()).toHaveLength(0);
  });

  it("can't target a handle that doesn't exist", async () => {
    expect((await as("ana")("PUT", "/follows/nobody")).status).toBe(404);
  });

  it("needs a handle first, so the person followed can see who you are", async () => {
    expect((await as("zed")("PUT", "/follows/ben")).status).toBe(403);
    expect(await followRows()).toHaveLength(0);
  });

  it("re-following after a private account accepts doesn't turn it back into a request", async () => {
    await as("ana")("PUT", "/follows/dee");
    await as("dee")("PUT", "/followers/ana");
    await as("ana")("PUT", "/follows/dee");
    expect(await followRows()).toMatchObject([{ accepted: true }]);
  });

  it("keys on the user id, so renaming a handle keeps every follower", async () => {
    await as("ana")("PUT", "/follows/gus");
    expect((await as("gus")("PATCH", "/profile", { username: "gus_renamed" })).status).toBe(204);

    expect(await followRows()).toEqual([expect.objectContaining({ followerId: ids.ana, followeeId: ids.gus })]);
    expect(await json(as("ana")("GET", "/users/gus_renamed"))).toMatchObject({ followStatus: "following", canView: true });
    expect((await as("ana")("GET", "/users/gus")).status).toBe(404);
    expect((await json(as("ana")("GET", "/feed"))).map((f: { username: string }) => f.username)).toContain("gus_renamed");

    await as("gus")("PATCH", "/profile", { username: "gus" });
  });

  it("rejects a handle someone else has with 409", async () => {
    expect((await as("cat")("PATCH", "/profile", { username: "ben" })).status).toBe(409);
  });
});

describe("private accounts", () => {
  it("turn a follow into a request that only the account itself can accept", async () => {
    await as("ana")("PUT", "/follows/dee");
    expect(await followRows()).toMatchObject([{ accepted: false }]);

    // ana can't accept her own request: /followers only touches people following you.
    await as("ana")("PUT", "/followers/dee");
    expect(await followRows()).toMatchObject([{ accepted: false }]);

    await as("dee")("PUT", "/followers/ana");
    expect(await followRows()).toMatchObject([{ accepted: true }]);
  });

  it("accept every pending request on going public", async () => {
    await as("ana")("PUT", "/follows/dee");
    await as("dee")("PATCH", "/profile", { isPrivate: false });
    expect(await followRows()).toMatchObject([{ accepted: true }]);
    await as("dee")("PATCH", "/profile", { isPrivate: true });
  });
});

describe("you only see the data of accounts you follow", () => {
  it("hides the films and stats of someone you don't follow", async () => {
    const cat = await json(as("ana")("GET", "/users/cat"));
    expect(cat).toMatchObject({ username: "cat", canView: false, followStatus: null });
    expect(cat).not.toHaveProperty("watched");
    expect(cat).not.toHaveProperty("stats");
  });

  it("treats a pending request like not following: nothing visible, not counted", async () => {
    await as("ana")("PUT", "/follows/dee");
    const dee = await json(as("ana")("GET", "/users/dee"));
    expect(dee).toMatchObject({ followStatus: "requested", canView: false, followers: 0 });
    expect(await json(as("ana")("GET", "/feed"))).toEqual([]);
  });

  it("shows a followed member's films, minus ratings they marked not visible to followers", async () => {
    await as("ana")("PUT", "/follows/ben");
    const ben = await json(as("ana")("GET", "/users/ben"));
    expect(ben.canView).toBe(true);
    expect(ben.watched.map((w: { title: string; rating: number | null }) => [w.title, w.rating]).sort()).toEqual([
      ["Alien", null],
      ["Heat", 8],
    ]);
    expect(ben.stats).toMatchObject({ watched: 2, rated: 1, average: 8 });
  });

  it("builds the feed only from people you follow", async () => {
    await as("ana")("PUT", "/follows/ben");
    await as("ana")("PUT", "/follows/dee"); // pending
    const feed = await json(as("ana")("GET", "/feed"));
    expect(new Set(feed.map((f: { username: string }) => f.username))).toEqual(new Set(["ben"]));
    expect(feed.find((f: { title: string }) => f.title === "Alien").rating).toBeNull();
  });

  it("lists only followed members under 'watched by' in search results", async () => {
    await as("ana")("PUT", "/follows/ben");
    await as("ana")("PUT", "/follows/dee"); // pending
    const { sections } = await json(as("ana")("GET", "/search?q=film"));
    expect(sections[0].films.map((f: { friends: string[] }) => f.friends)).toEqual([["ben"], ["ben"]]);
  });
});

it("never sends another member's user id to the browser", async () => {
  await as("ana")("PUT", "/follows/ben");
  await as("ana")("PUT", "/follows/dee");
  const responses = await Promise.all(
    ["/users/ben", "/users/cat", "/users/dee", "/users/nobody", "/users?q=e", "/feed", "/search?q=film"].map((path) =>
      as("ana")("GET", path).then((res) => res.text()),
    ),
  );
  responses.push(await (await as("ana")("PUT", "/follows/ana")).text());
  for (const body of responses) {
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  }
});

it("deleting an account removes its follows in both directions", async () => {
  await as("ana")("PUT", "/follows/eve");
  await as("eve")("PUT", "/follows/ben");
  expect((await as("eve")("DELETE", "/profile")).status).toBe(204);
  expect(await followRows()).toHaveLength(0);
});
