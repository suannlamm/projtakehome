import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { ensureMovie } from "@/lib/tmdb";
import type { Env } from "@/server/env";
import { clearHomeRow, saveToList } from "./watchlist";

const reviewSchema = z.object({
  rating: z
    .number({ error: "Pick a rating from 1 to 10 before saving" })
    .int("Rating must be a whole number from 1 to 10")
    .min(1, "Rating must be a whole number from 1 to 10")
    .max(10, "Rating must be a whole number from 1 to 10"),
  body: z.string().trim().max(5000, "Reviews must be 5000 characters or fewer").nullish(),
  isPublic: z.boolean().default(true),
});

export const reviewRoutes = new Hono<Env>()
  // Create or replace the user's rating of this film. Rating a film marks it watched.
  .put("/:movieId{[0-9]{1,9}}", async (c) => {
    const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid review" }, 400);

    const userId = c.get("userId");
    const movieId = Number(c.req.param("movieId"));
    if (!(await ensureMovie(movieId))) return c.json({ error: "Movie not found" }, 404);

    // One transaction: a film is never left marked watched without the rating that marked it.
    const values = { rating: parsed.data.rating, body: parsed.data.body || null, isPublic: parsed.data.isPublic };
    await db.transaction(async (tx) => {
      await saveToList(userId, movieId, true, tx);
      await tx
        .insert(reviews)
        .values({ userId, movieId, ...values })
        .onConflictDoUpdate({ target: [reviews.userId, reviews.movieId], set: { ...values, updatedAt: sql`now()` } });
    });
    clearHomeRow(userId);
    return c.body(null, 204);
  })
  // Deletes the rating only; the film stays watched. Ratings order the home row, so it's cleared.
  .delete("/:movieId{[0-9]{1,9}}", async (c) => {
    const movieId = Number(c.req.param("movieId"));
    await db.delete(reviews).where(and(eq(reviews.userId, c.get("userId")), eq(reviews.movieId, movieId)));
    clearHomeRow(c.get("userId"));
    return c.body(null, 204);
  });
