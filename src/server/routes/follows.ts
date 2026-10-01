import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { follows, profiles } from "@/db/schema";
import type { Env } from "@/server/env";

// Users are addressed by username; their ids are resolved here and never sent back.
const idOf = (username: string) =>
  db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, username.toLowerCase()));

// People you follow. Following a private account sends a request until they accept it.
// Following twice is a no-op: the (follower, followee) primary key means one row at most.
export const followRoutes = new Hono<Env>()
  .put("/:username", async (c) => {
    const userId = c.get("userId");
    const [target] = await db
      .select({ id: profiles.id, isPrivate: profiles.isPrivate })
      .from(profiles)
      .where(eq(profiles.username, c.req.param("username").toLowerCase()));
    if (!target) return c.json({ error: "User not found" }, 404);
    if (target.id === userId) return c.json({ error: "You can't follow yourself" }, 400);

    await db
      .insert(follows)
      .values({ followerId: userId, followeeId: target.id, accepted: !target.isPrivate })
      .onConflictDoNothing();
    return c.body(null, 204);
  })
  // Unfollows, or cancels a pending request.
  .delete("/:username", async (c) => {
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, c.get("userId")), inArray(follows.followeeId, idOf(c.req.param("username")))));
    return c.body(null, 204);
  });

// People who follow you: accept a request, or decline it / remove a follower.
export const followerRoutes = new Hono<Env>()
  .put("/:username", async (c) => {
    await db
      .update(follows)
      .set({ accepted: true })
      .where(and(eq(follows.followeeId, c.get("userId")), inArray(follows.followerId, idOf(c.req.param("username")))));
    return c.body(null, 204);
  })
  .delete("/:username", async (c) => {
    await db
      .delete(follows)
      .where(and(eq(follows.followeeId, c.get("userId")), inArray(follows.followerId, idOf(c.req.param("username")))));
    return c.body(null, 204);
  });
