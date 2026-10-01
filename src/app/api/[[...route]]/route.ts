import { Hono } from "hono";
import { handle } from "hono/vercel";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { TmdbError } from "@/lib/tmdb";
import type { Env } from "@/server/env";
import { feedRoutes } from "@/server/routes/feed";
import { followerRoutes, followRoutes } from "@/server/routes/follows";
import { profileRoutes } from "@/server/routes/profile";
import { recommendationRoutes } from "@/server/routes/recommendations";
import { reviewRoutes } from "@/server/routes/reviews";
import { searchRoutes } from "@/server/routes/search";
import { userRoutes } from "@/server/routes/users";
import { watchlistRoutes } from "@/server/routes/watchlist";

// Recommendations call TMDB + Gemini, which can take several seconds.
export const maxDuration = 60;

const app = new Hono<Env>().basePath("/api");

// Public: pinged daily by the Vercel cron (vercel.json) so the Supabase free tier doesn't pause.
app.get("/health", async (c) => {
  await db.execute(sql`select 1`);
  return c.json({ ok: true });
});

// Every route registered below this line requires a signed-in user with a handle. Picking one is
// /api/profile's job, so it's the one route a handle-less user is still let through to.
app.use("*", async (c, next) => {
  const userId = await getUserId();
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", userId);

  if (c.req.path !== "/api/profile") {
    const [profile] = await db.select({ username: profiles.username }).from(profiles).where(eq(profiles.id, userId));
    if (!profile?.username) return c.json({ error: "Finish setting up your account: pick a handle first." }, 403);
  }
  await next();
});

app.route("/search", searchRoutes);
app.route("/watchlist", watchlistRoutes);
app.route("/reviews", reviewRoutes);
app.route("/follows", followRoutes);
app.route("/followers", followerRoutes);
app.route("/users", userRoutes);
app.route("/feed", feedRoutes);
app.route("/profile", profileRoutes);
app.route("/recommendations", recommendationRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
// TMDB outages aren't retried; the user sees a clear message and tries again later.
app.onError((err, c) => {
  console.error(err);
  if (err instanceof TmdbError) return c.json({ error: "The film database (TMDB) isn't responding. Try again in a moment." }, 502);
  return c.json({ error: "Something went wrong on our side. Try again." }, 500);
});

const handler = handle(app);
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
