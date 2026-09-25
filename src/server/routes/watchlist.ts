import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { watchlist } from "@/db/schema";
import { ensureMovie } from "@/lib/tmdb";
import type { Env } from "@/server/env";

// :movieId is limited to 1-9 digits, so anything else 404s and always fits in a Postgres integer.
export const watchlistRoutes = new Hono<Env>()
  .put("/:movieId{[0-9]{1,9}}", async (c) => {
    const movieId = Number(c.req.param("movieId"));
    if (!(await ensureMovie(movieId))) return c.json({ error: "Movie not found" }, 404);

    await db.insert(watchlist).values({ userId: c.get("userId"), movieId }).onConflictDoNothing();
    return c.body(null, 204);
  })
  .delete("/:movieId{[0-9]{1,9}}", async (c) => {
    const movieId = Number(c.req.param("movieId"));
    await db.delete(watchlist).where(and(eq(watchlist.userId, c.get("userId")), eq(watchlist.movieId, movieId)));
    return c.body(null, 204);
  });
