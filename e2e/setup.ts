import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { accounts, PASSWORD } from "./accounts";

// Creates the test accounts the same way scripts/seed.ts does, with new ids each run (so nothing
// cached for an earlier run's accounts applies), and returns the teardown that deletes them.
// Deleting the auth user cascades to its profile, lists, ratings, follows and taste profile.
const removeAccounts = (sql: postgres.Sql) => sql`delete from auth.users where email like 'e2e-%@example.com'`;

export default async function setup() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  await removeAccounts(sql);

  const ids: Record<string, string> = {};
  for (const [name, { email, handle }] of Object.entries(accounts)) {
    const id = (ids[name] = randomUUID());
    await sql`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${email},
        extensions.crypt(${PASSWORD}, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')`;
    await sql`
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), ${id}, ${id}, 'email', ${sql.json({ sub: id, email, email_verified: true })}, now(), now(), now())`;
    if (handle) await sql`update profiles set username = ${handle} where id = ${id}`;
  }

  await sql`insert into movies (id, title) values (155, 'The Dark Knight') on conflict do nothing`;
  await sql`insert into watchlist (user_id, movie_id, watched_at) values (${ids.ben}, 155, now())`;
  await sql`insert into reviews (user_id, movie_id, rating, body) values (${ids.ben}, 155, 9, 'Still the best one.')`;
  await sql.end();

  return async () => {
    const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    await removeAccounts(sql);
    await sql.end();
  };
}
