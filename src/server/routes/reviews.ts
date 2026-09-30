import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { ensureMovie } from "@/lib/tmdb";
import type { Env } from "@/server/env";
import { saveToList } from "./watchlist";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(10),
  body: z.string().trim().max(5000).nullish(),
  isPublic: z.boolean().default(true),
});

export const reviewRoutes = new Hono<Env>()
  // Create or replace the user's rating of this film. Rating a film marks it watched.
  .put("/:movieId{[0-9]{1,9}}", async (c) => {
    const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid review", issues: parsed.error.issues }, 400);

    const userId = c.get("userId");
    const movieId = Number(c.req.param("movieId"));
    if (!(await ensureMovie(movieId))) return c.json({ error: "Movie not found" }, 404);

    const values = { rating: parsed.data.rating, body: parsed.data.body || null, isPublic: parsed.data.isPublic };
    await saveToList(userId, movieId, true);
    await db
      .insert(reviews)
      .values({ userId, movieId, ...values })
      .onConflictDoUpdate({ target: [reviews.userId, reviews.movieId], set: { ...values, updatedAt: sql`now()` } });
    return c.body(null, 204);
  })
  // Deletes the rating only; the film stays watched.
  .delete("/:movieId{[0-9]{1,9}}", async (c) => {
    const movieId = Number(c.req.param("movieId"));
    await db.delete(reviews).where(and(eq(reviews.userId, c.get("userId")), eq(reviews.movieId, movieId)));
    return c.body(null, 204);
  });
