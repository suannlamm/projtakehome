import { Hono } from "hono";
import { getProfile } from "@/lib/queries";
import type { Env } from "@/server/env";

export const userRoutes = new Hono<Env>().get("/:username", async (c) => {
  const profile = await getProfile(c.req.param("username"), c.get("userId"));
  if (!profile) return c.json({ error: "User not found" }, 404);
  return c.json(profile);
});
