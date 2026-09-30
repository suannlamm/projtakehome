import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import type { Env } from "@/server/env";

const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "Handle must be 3-20 characters: letters, numbers or underscores"),
  displayName: z.string().trim().max(50, "Display name must be 50 characters or fewer").nullish(),
});

// Sets the current user's handle and display name (used by /onboarding).
// Handles are unique; a taken one returns 409 so the user can pick another.
export const profileRoutes = new Hono<Env>().patch("/", async (c) => {
  const parsed = profileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile" }, 400);

  const { username, displayName } = parsed.data;
  try {
    await db
      .update(profiles)
      .set({ username, displayName: displayName || null })
      .where(eq(profiles.id, c.get("userId")));
  } catch (err) {
    // 23505 = unique_violation: the database, not a prior check, decides who gets a handle.
    if ((err as { cause?: { code?: string } }).cause?.code === "23505") {
      return c.json({ error: "That handle is taken" }, 409);
    }
    throw err;
  }
  return c.json({ username });
});
