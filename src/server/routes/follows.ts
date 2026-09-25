import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { follows, profiles } from "@/db/schema";
import type { Env } from "@/server/env";

// Users are addressed by username; their ids are resolved here and never sent back.
export const followRoutes = new Hono<Env>()
  .put("/:username", async (c) => {
    const userId = c.get("userId");
    const [target] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.username, c.req.param("username").toLowerCase()));
    if (!target) return c.json({ error: "User not found" }, 404);
    if (target.id === userId) return c.json({ error: "You can't follow yourself" }, 400);

    await db.insert(follows).values({ followerId: userId, followeeId: target.id }).onConflictDoNothing();
    return c.body(null, 204);
  })
  .delete("/:username", async (c) => {
    const target = db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.username, c.req.param("username").toLowerCase()));
    await db.delete(follows).where(and(eq(follows.followerId, c.get("userId")), inArray(follows.followeeId, target)));
    return c.body(null, 204);
  });
