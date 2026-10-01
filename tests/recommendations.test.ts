import { APICallError } from "ai";
import { beforeEach, expect, it, vi } from "vitest";
import { asUser } from "./helpers";

// Gemini, TMDB and the database are all mocked: these tests never use the real API or its quota.
const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText }));
vi.mock("@/db", () => ({
  // Every direct query gets the taste preferences back (watched films on, watchlist off),
  // which also leaves the user's own list empty.
  db: { select: () => ({ from: () => ({ where: async () => [{ watched: true, watchlist: false }] }) }) },
}));
const film = (id: number, title = `Film ${id}`) => ({ id, title, poster_path: null, release_date: "2001-01-01", overview: "", vote_average: 7 });
vi.mock("@/lib/queries", () => ({
  getWatchedHistory: async () => [{ movieId: 1, title: "Heat", rating: 9, body: null }],
  getCandidates: async () => [2, 3, 4].map((id) => film(id)),
}));
// TMDB title search only knows "WALL·E".
vi.mock("@/lib/tmdb", () => ({
  tmdb: async (_path: string, params: { query: string }) => ({ results: params.query === "WALL·E" ? [film(10681, "WALL·E")] : [] }),
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

const post = asUser(recommendationRoutes);
const generate = () => post("POST", "/", {});
const modelsTried = () => generateText.mock.calls.map(([options]) => options.model.modelId);

beforeEach(() => {
  generateText.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
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
  const body = await (await generate()).json();
  expect(body.tasteProfile).toBe(reply.output.tasteProfile);
  expect(body.picks.map((p: { movieId: number }) => p.movieId)).toEqual([2, 10681]);
});
