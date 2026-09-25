// Shared Hono context type: the auth middleware in app/api/[[...route]]/route.ts sets userId,
// so every route file can read it with c.get("userId").
export type Env = { Variables: { userId: string } };
