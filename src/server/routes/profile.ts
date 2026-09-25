import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import type { Env } from "@/server/env";

const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3-20 characters: letters, numbers or underscores"),
});

// Sets the current user's username (used by /onboarding).
export const profileRoutes = new Hono<Env>().patch("/", async (c) => {
  const parsed = profileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid username" }, 400);

  const userId = c.get("userId");
  const { username } = parsed.data;
  const [taken] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.username, username), ne(profiles.id, userId)));
  if (taken) return c.json({ error: "That username is taken" }, 409);

  await db.update(profiles).set({ username }).where(eq(profiles.id, userId));
  return c.json({ username });
});
