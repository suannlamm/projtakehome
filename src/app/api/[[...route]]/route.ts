import { Hono } from "hono";
import { handle } from "hono/vercel";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getUserId } from "@/lib/auth";
import type { Env } from "@/server/env";
import { feedRoutes } from "@/server/routes/feed";
import { followRoutes } from "@/server/routes/follows";
import { profileRoutes } from "@/server/routes/profile";
import { recommendationRoutes } from "@/server/routes/recommendations";
import { reviewRoutes } from "@/server/routes/reviews";
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

// Every route registered below this line requires a signed-in user.
app.use("*", async (c, next) => {
  const userId = await getUserId();
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", userId);
  await next();
});

app.route("/watchlist", watchlistRoutes);
app.route("/reviews", reviewRoutes);
app.route("/follows", followRoutes);
app.route("/users", userRoutes);
app.route("/feed", feedRoutes);
app.route("/profile", profileRoutes);
app.route("/recommendations", recommendationRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

const handler = handle(app);
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
