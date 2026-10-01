import { Hono } from "hono";
import { revalidateTag } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { watchlist } from "@/db/schema";
import { homeTag } from "@/lib/queries";
import { ensureMovie } from "@/lib/tmdb";
import type { Env } from "@/server/env";

const bodySchema = z.object({ watched: z.boolean().default(false) });

// Clears the user's cached home page row, so it reflects their list straight away. Called only once
// every write has finished: clearing earlier would let a home page load in between cache old data.
export const clearHomeRow = (userId: string) => revalidateTag(homeTag(userId), { expire: 0 });

// Adds a film to the list, or marks it watched with { watched: true }. The first watched time is kept,
// and a watched film is never moved back to "to watch". tx lets it run inside a caller's transaction.
export async function saveToList(userId: string, movieId: number, watched: boolean, tx: Pick<typeof db, "insert"> = db) {
  const insert = tx.insert(watchlist).values({ userId, movieId, watchedAt: watched ? sql`now()` : null });
  await (watched
    ? insert.onConflictDoUpdate({
        target: [watchlist.userId, watchlist.movieId],
        set: { watchedAt: sql`coalesce(${watchlist.watchedAt}, now())` },
      })
    : insert.onConflictDoNothing());
}

// :movieId is limited to 1-9 digits, so anything else 404s and always fits in a Postgres integer.
export const watchlistRoutes = new Hono<Env>()
  .put("/:movieId{[0-9]{1,9}}", async (c) => {
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Invalid body" }, 400);

    const movieId = Number(c.req.param("movieId"));
    if (!(await ensureMovie(movieId))) return c.json({ error: "Movie not found" }, 404);

    await saveToList(c.get("userId"), movieId, parsed.data.watched);
    clearHomeRow(c.get("userId"));
    return c.body(null, 204);
  })
  // Removing a film also removes its rating (the review's foreign key cascades).
  .delete("/:movieId{[0-9]{1,9}}", async (c) => {
    const movieId = Number(c.req.param("movieId"));
    await db.delete(watchlist).where(and(eq(watchlist.userId, c.get("userId")), eq(watchlist.movieId, movieId)));
    clearHomeRow(c.get("userId"));
    return c.body(null, 204);
  });
