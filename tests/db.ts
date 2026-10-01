import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

// The app's real migrations in an in-memory Postgres, so tests check the actual SQL.
// auth.users stands in for Supabase's table; the migrations' trigger creates a profile per row.
export async function createTestDb() {
  const client = new PGlite();
  await client.exec(`create schema auth;
    create table auth.users (
      id uuid primary key, email text, phone text, email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
    );`);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}
