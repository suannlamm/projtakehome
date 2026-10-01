import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { z } from "zod";
import { db } from "@/db";
import { follows, profiles } from "@/db/schema";
import type { Env } from "@/server/env";

// Every field is optional, so onboarding and each settings control send only what they change.
const profileSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,20}$/, "Handle must be 3-20 characters: letters, numbers or underscores"),
    displayName: z
      .string()
      .trim()
      .max(50, "Display name must be 50 characters or fewer")
      .transform((v) => v || null)
      .nullish(),
    isPrivate: z.boolean(),
    tasteUsesWatched: z.boolean(),
    tasteUsesWatchlist: z.boolean(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");

export const profileRoutes = new Hono<Env>()
  // Handles are unique; a taken one returns 409 so the user can pick another.
  .patch("/", async (c) => {
    const parsed = profileSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile" }, 400);

    const userId = c.get("userId");
    try {
      await db.transaction(async (tx) => {
        await tx.update(profiles).set(parsed.data).where(eq(profiles.id, userId));
        // Going public accepts every pending follow request.
        if (parsed.data.isPrivate === false) {
          await tx.update(follows).set({ accepted: true }).where(and(eq(follows.followeeId, userId), eq(follows.accepted, false)));
        }
      });
    } catch (err) {
      // 23505 = unique_violation: the database, not a prior check, decides who gets a handle.
      if ((err as { cause?: { code?: string } }).cause?.code === "23505") {
        return c.json({ error: "That handle is taken" }, 409);
      }
      throw err;
    }
    return c.body(null, 204);
  })
  // Deletes the Supabase auth user; profiles, lists, reviews and follows all cascade from it.
  .delete("/", async (c) => {
    await db.delete(authUsers).where(eq(authUsers.id, c.get("userId")));
    return c.body(null, 204);
  });
