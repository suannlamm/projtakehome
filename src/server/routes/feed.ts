import { Hono } from "hono";
import { getFeed } from "@/lib/queries";
import type { Env } from "@/server/env";

export const feedRoutes = new Hono<Env>().get("/", async (c) => c.json(await getFeed(c.get("userId"))));
