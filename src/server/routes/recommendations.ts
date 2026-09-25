import { createHash } from "node:crypto";
import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { db } from "@/db";
import { movies, recommendationCache, reviews, watchlist, type Recommendations } from "@/db/schema";
import { tmdb, type TmdbMovie } from "@/lib/tmdb";
import type { Env } from "@/server/env";

const MIN_RATINGS = 3;

// Hybrid approach: TMDB supplies real candidate films, Gemini picks from them and explains why.
// The model can't invent films, because any pick that isn't a candidate is dropped.
export const recommendationRoutes = new Hono<Env>().get("/", async (c) => {
  const userId = c.get("userId");

  // All of the user's own reviews count here, including private ones.
  const rated = await db
    .select({ movieId: reviews.movieId, rating: reviews.rating, title: movies.title, body: reviews.body })
    .from(reviews)
    .innerJoin(movies, eq(movies.id, reviews.movieId))
    .where(eq(reviews.userId, userId))
    .orderBy(desc(reviews.rating), desc(reviews.updatedAt));
  if (rated.length < MIN_RATINGS) {
    return c.json({ status: "not_enough_ratings", needed: MIN_RATINGS - rated.length });
  }

  // Cache key: the user's rating history. Any new, changed or deleted rating produces a new hash.
  const historyHash = createHash("sha256")
    .update(rated.map((r) => `${r.movieId}:${r.rating}`).sort().join(","))
    .digest("hex");
  const [cached] = await db.select().from(recommendationCache).where(eq(recommendationCache.userId, userId));
  if (cached?.historyHash === historyHash) return c.json({ status: "ok", ...cached.payload });

  // Candidates: TMDB recommendations for the top 5 rated films, excluding anything already rated or watchlisted.
  // Films suggested by several seeds rank first.
  const watchlisted = await db.select({ movieId: watchlist.movieId }).from(watchlist).where(eq(watchlist.userId, userId));
  const exclude = new Set([...rated.map((r) => r.movieId), ...watchlisted.map((w) => w.movieId)]);
  const seedResults = await Promise.all(
    rated.slice(0, 5).map((r) => tmdb<{ results: TmdbMovie[] }>(`/movie/${r.movieId}/recommendations`)),
  );
  const candidates = new Map<number, { movie: TmdbMovie; hits: number }>();
  for (const result of seedResults) {
    for (const movie of result?.results ?? []) {
      if (exclude.has(movie.id)) continue;
      const entry = candidates.get(movie.id) ?? { movie, hits: 0 };
      entry.hits++;
      candidates.set(movie.id, entry);
    }
  }
  const pool = [...candidates.values()]
    .sort((a, b) => b.hits - a.hits || b.movie.vote_average - a.movie.vote_average)
    .slice(0, 20)
    .map((e) => e.movie);
  if (pool.length === 0) return c.json({ status: "no_candidates" });

  let output: { tasteProfile: string; picks: { tmdbId: number; reason: string }[] };
  try {
    ({ output } = await generateText({
      model: google("gemini-flash-latest"),
      output: Output.object({
        schema: z.object({
          tasteProfile: z.string().describe("2-3 sentences describing the user's taste, addressed to them as 'you'"),
          picks: z
            .array(z.object({ tmdbId: z.number().int(), reason: z.string().describe("1-2 sentences") }))
            .min(3)
            .max(5),
        }),
      }),
      prompt: [
        "You are a film recommender. Here is what the user has rated (1-5 stars):",
        ...rated.slice(0, 30).map((r) => `- ${r.title}: ${r.rating}/5${r.body ? ` - "${r.body.slice(0, 200)}"` : ""}`),
        "",
        "Choose 3 to 5 films ONLY from these candidates (use the exact id):",
        ...pool.map((m) => `- id ${m.id}: ${m.title} (${m.release_date?.slice(0, 4) || "n/a"}) - ${m.overview.slice(0, 200)}`),
        "",
        "Write a short taste profile, then for each pick explain why it suits them, referring to specific films they rated.",
      ].join("\n"),
    }));
  } catch (err) {
    console.error(err);
    return c.json({ error: "The AI service is unavailable right now. Try again in a minute." }, 503);
  }

  const byId = new Map(pool.map((m) => [m.id, m]));
  const payload: Recommendations = {
    tasteProfile: output.tasteProfile,
    picks: output.picks
      .filter((p) => byId.has(p.tmdbId))
      .map((p) => {
        const m = byId.get(p.tmdbId)!;
        return {
          movieId: m.id,
          title: m.title,
          posterPath: m.poster_path,
          year: m.release_date?.slice(0, 4) ?? "",
          reason: p.reason,
        };
      }),
  };

  await db
    .insert(recommendationCache)
    .values({ userId, historyHash, payload })
    .onConflictDoUpdate({
      target: recommendationCache.userId,
      set: { historyHash, payload, createdAt: sql`now()` },
    });
  return c.json({ status: "ok", ...payload });
});
