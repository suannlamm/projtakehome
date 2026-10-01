import { APICallError, LoadAPIKeyError } from "ai";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authUsers } from "drizzle-orm/supabase";
import { db } from "@/db";
import { profiles, tasteProfiles } from "@/db/schema";
import { asUser } from "./helpers";

// Gemini and TMDB are mocked, so these tests never use the real API or its quota. The database is
// the real schema in memory (see db.ts), with one member whose list is empty.
const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText }));
vi.mock("@/db", async () => ({ db: await (await import("./db")).createTestDb() }));
const film = (id: number, title = `Film ${id}`) => ({ id, title, poster_path: null, release_date: "2001-01-01", overview: "", vote_average: 7 });
// A fixed history and TMDB candidates; every other query runs for real.
vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  getWatchedHistory: async () => [{ movieId: 1, title: "Heat", rating: 9, body: null }],
  getCandidates: async () => [2, 3, 4].map((id) => film(id)),
}));
// TMDB title search only knows "WALL·E", and fails outright for "TMDB down".
vi.mock("@/lib/tmdb", () => ({
  tmdb: async (_path: string, params: { query: string }) => {
    if (params.query === "TMDB down") throw new Error("TMDB 503");
    return { results: params.query === "WALL·E" ? [film(10681, "WALL·E")] : [] };
  },
}));

import { recommendationRoutes } from "@/server/routes/recommendations";

const apiError = (statusCode: number) =>
  new APICallError({ message: `Gemini ${statusCode}`, url: "", requestBodyValues: {}, statusCode });
const reply = {
  output: {
    tasteProfile: "You like slow-burn crime films.",
    picks: [
      { candidateId: 2, title: "Film 2", year: 2001, reason: "Like Heat" },
      { candidateId: null, title: "WALL·E", year: 2008, reason: "Outside the pool, but real" },
      { candidateId: null, title: "Robo Dreams 3000", year: 2020, reason: "Made up" },
    ],
  },
};

const userId = "00000000-0000-4000-8000-000000000001";
const post = asUser(recommendationRoutes, userId);
const generate = (body: { prompt?: string; refresh?: boolean } = {}) => post("POST", "/", body);
const modelsTried = () => generateText.mock.calls.map(([options]) => options.model.modelId);

beforeAll(() => db.insert(authUsers).values({ id: userId }));

// Each test starts with no saved profile and a full day's allowance.
beforeEach(async () => {
  generateText.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  await db.delete(tasteProfiles);
  await db.update(profiles).set({ tasteGenerations: 0, tasteGenerationsOn: null });
});

it("moves on to the next model when one is overloaded, without retrying it", async () => {
  generateText.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(reply);
  const res = await generate();
  expect(res.status).toBe(200);
  expect(modelsTried()).toEqual(["gemini-3.8-flash", "gemini-3.7-flash"]);
});

it("tries every backup model in order, then returns a 503", async () => {
  generateText.mockRejectedValue(apiError(503));
  const res = await generate();
  expect(res.status).toBe(503);
  expect(modelsTried()).toEqual(["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]);
});

it("says the usage limit is reached only when every model hit its quota", async () => {
  generateText.mockRejectedValue(apiError(429));
  expect((await generate()).status).toBe(429);

  generateText.mockReset().mockRejectedValueOnce(apiError(429)).mockRejectedValue(apiError(503));
  expect((await generate()).status).toBe(503);
});

it("keeps candidates, looks up outside picks on TMDB, and drops ones TMDB can't find", async () => {
  generateText.mockResolvedValue(reply);
  const { profile } = await (await generate()).json();
  expect(profile.tasteProfile).toBe(reply.output.tasteProfile);
  expect(profile.picks.map((p: { movieId: number }) => p.movieId)).toEqual([2, 10681]);
});

it("reuses the saved profile when nothing has changed, without calling Gemini again", async () => {
  generateText.mockResolvedValue(reply);
  const first = await (await generate()).json();
  const second = await (await generate()).json();
  expect(generateText).toHaveBeenCalledOnce();
  expect(first.profile.cached).toBe(false);
  expect(second.profile).toEqual({ ...first.profile, cached: true });
});

it("calls Gemini again when the prompt changes", async () => {
  generateText.mockResolvedValue(reply);
  await generate();
  await generate({ prompt: "something with robots" });
  expect(generateText).toHaveBeenCalledTimes(2);
});

it("calls Gemini again when new picks are asked for, even with nothing changed", async () => {
  generateText.mockResolvedValue(reply);
  await generate();
  await generate({ refresh: true });
  expect(generateText).toHaveBeenCalledTimes(2);
});

it("doesn't save a failed attempt", async () => {
  generateText.mockRejectedValue(apiError(503));
  await generate();
  expect((await (await post("GET", "/")).json()).profile).toBeNull();
});

it("returns the saved profile, with the prompt it was made with, on GET", async () => {
  generateText.mockResolvedValue(reply);
  await generate({ prompt: "older than 2000" });
  const { profile } = await (await post("GET", "/")).json();
  expect(profile).toMatchObject({ tasteProfile: reply.output.tasteProfile, prompt: "older than 2000", cached: true });
  expect(generateText).toHaveBeenCalledOnce();
});

describe("Gemini errors", () => {
  const usedToday = async () => (await (await post("GET", "/")).json()).usage.used;
  const outsidePicks = (...titles: string[]) => ({
    output: { tasteProfile: "x", picks: titles.map((title) => ({ candidateId: null, title, year: 2000, reason: "r" })) },
  });

  it("gives each model a time limit", async () => {
    generateText.mockResolvedValue(reply);
    await generate();
    expect(generateText.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("says it took too long when every model timed out", async () => {
    generateText.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
    const res = await generate();
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/too long/);
    expect(await usedToday()).toBe(0);
  });

  it.each([
    ["a missing API key", new LoadAPIKeyError({ message: "GOOGLE_GENERATIVE_AI_API_KEY is missing" })],
    ["a rejected API key", apiError(403)],
  ])("stops after the first model on %s, since no other model would work", async (_, err) => {
    generateText.mockRejectedValue(err);
    const res = await generate();
    expect(res.status).toBe(500);
    expect(modelsTried()).toEqual(["gemini-3.8-flash"]);
    expect(await usedToday()).toBe(0);
  });

  it("gives the generation back if TMDB fails after Gemini answered", async () => {
    generateText.mockResolvedValue(outsidePicks("TMDB down"));
    expect((await generate()).status).toBe(500);
    expect(await usedToday()).toBe(0);
  });

  it("doesn't save or count a profile whose picks were all dropped", async () => {
    generateText.mockResolvedValue(outsidePicks("Made Up One", "Made Up Two"));
    const res = await generate();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/real film/);
    expect(await usedToday()).toBe(0);
    expect((await (await post("GET", "/")).json()).profile).toBeNull();
  });
});

describe("daily limit of 2 generations", () => {
  it("counts each Gemini call and refuses a third that day, without calling Gemini", async () => {
    generateText.mockResolvedValue(reply);
    expect((await (await generate({ prompt: "a" })).json()).usage).toEqual({ used: 1, limit: 2 });
    expect((await (await generate({ prompt: "b" })).json()).usage).toEqual({ used: 2, limit: 2 });

    const third = await generate({ prompt: "c" });
    expect(third.status).toBe(429);
    expect(await third.json()).toMatchObject({ error: expect.stringContaining("reset"), usage: { used: 2, limit: 2 } });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("still shows the saved profile once the limit is reached, since that doesn't call Gemini", async () => {
    generateText.mockResolvedValue(reply);
    await generate({ prompt: "a" });
    await generate({ prompt: "b" });
    const reused = await generate({ prompt: "b" });
    expect(reused.status).toBe(200);
    expect((await reused.json()).profile.cached).toBe(true);
  });

  it("gives the generation back when every model fails", async () => {
    generateText.mockRejectedValue(apiError(503));
    await generate();
    expect((await (await post("GET", "/")).json()).usage).toEqual({ used: 0, limit: 2 });
  });

  it("starts again on a new day", async () => {
    await db.update(profiles).set({ tasteGenerations: 2, tasteGenerationsOn: "2000-01-01" });
    generateText.mockResolvedValue(reply);
    const res = await generate();
    expect(res.status).toBe(200);
    expect((await res.json()).usage).toEqual({ used: 1, limit: 2 });
  });

  it("can't be beaten by sending several requests at once", async () => {
    generateText.mockResolvedValue(reply);
    const statuses = await Promise.all(["a", "b", "c", "d"].map(async (prompt) => (await generate({ prompt })).status));
    expect(statuses.filter((s) => s === 200)).toHaveLength(2);
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});
