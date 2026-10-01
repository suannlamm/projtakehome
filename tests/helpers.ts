import { Hono, type Schema } from "hono";
import type { Env } from "@/server/env";

// Sends a request through the whole /api app, auth middleware included. Imported lazily so test
// files that only use asUser don't load every route.
export async function callApi(method: string, path: string, body?: unknown) {
  const { GET: handler } = await import("@/app/api/[[...route]]/route");
  return handler(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

// Mounts one API router behind a signed-in user, as the /api auth middleware does, and returns a
// function that sends it a request.
export function asUser<S extends Schema>(routes: Hono<Env, S>, userId = "user-1") {
  const app = new Hono<Env>()
    .use(async (c, next) => {
      c.set("userId", userId);
      await next();
    })
    .route("/", routes);
  return (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}
