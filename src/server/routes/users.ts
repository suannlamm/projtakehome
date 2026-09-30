import { Hono } from "hono";
import { getProfile, searchUsers } from "@/lib/queries";
import type { Env } from "@/server/env";

export const userRoutes = new Hono<Env>()
  .get("/", async (c) => {
    const q = c.req.query("q")?.trim() ?? "";
    if (q.length < 2) return c.json({ error: "Search needs at least 2 characters" }, 400);
    return c.json(await searchUsers(q, c.get("userId")));
  })
  .get("/:username", async (c) => {
    const profile = await getProfile(c.req.param("username"), c.get("userId"));
    if (!profile) return c.json({ error: "User not found" }, 404);
    return c.json(profile);
  });
