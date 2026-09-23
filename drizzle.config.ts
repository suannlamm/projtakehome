import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations run over the session pooler (DIRECT_URL); the app uses the transaction pooler (DATABASE_URL).
  dbCredentials: { url: process.env.DIRECT_URL ?? "" },
  // Only manage our own tables; auth.users belongs to Supabase.
  schemaFilter: ["public"],
});
