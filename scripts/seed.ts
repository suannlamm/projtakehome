// Seeds five mock members who all follow each other. Four have watch histories; "demo" starts
// empty and is the account to sign in with. Safe to re-run: ids are fixed and existing rows are kept.
// Run with `npm run db:seed` (reads .env.local).
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { follows, profiles, reviews, watchlist } from "@/db/schema";
import { ensureMovie } from "@/lib/tmdb";

const PASSWORD = "reel-demo-2026";

// watched: [TMDB id, rating out of 10 or null if unrated, review?]. toWatch: TMDB ids.
type Member = {
  id: string;
  username: string;
  displayName: string;
  watched: [number, number | null, string?][];
  toWatch: number[];
};

const members: Member[] = [
  { id: "5eed0000-0000-4000-8000-000000000001", username: "demo", displayName: "Demo User", watched: [], toWatch: [] },
  {
    id: "5eed0000-0000-4000-8000-000000000002",
    username: "sam",
    displayName: "Sam Carter",
    watched: [
      [693134, 10, "Somehow better than the first."],
      [438631, 9, "The scale of it. Saw it twice in IMAX."],
      [157336, 9],
      [335984, 8, "Gorgeous, slow in the best way."],
      [76341, 9],
      [329865, null],
      [872585, 7, "Great, but the last hour drags."],
    ],
    toWatch: [9693, 27205],
  },
  {
    id: "5eed0000-0000-4000-8000-000000000003",
    username: "mira",
    displayName: "Mira Okafor",
    watched: [
      [666277, 10, "Quietly devastating."],
      [965150, 10, "Still thinking about that last scene."],
      [376867, 9],
      [391713, 8],
      [152601, 8],
      [496243, 9],
      [313369, 6, "Loved the music, not the ending."],
    ],
    toWatch: [438631],
  },
  {
    id: "5eed0000-0000-4000-8000-000000000004",
    username: "jordan",
    displayName: "Jordan Lee",
    watched: [
      [419430, 9, "Rewatched and caught so much more."],
      [493922, 8, "Genuinely upsetting, in the best way."],
      [496243, 10],
      [546554, 8],
      [155, 9],
      [550, 7],
      [346698, null],
    ],
    toWatch: [872585],
  },
  {
    id: "5eed0000-0000-4000-8000-000000000005",
    username: "priya",
    displayName: "Priya Nair",
    watched: [
      [129, 10, "Comfort film forever."],
      [545611, 10, "Cried at a rock with googly eyes."],
      [120467, 9],
      [244786, 8],
      [313369, 9],
      [680, 6],
      [346698, 7, "More fun than it had any right to be."],
    ],
    toWatch: [965150],
  },
];

// Minimal Supabase auth user with a confirmed email and password. The on_auth_user_created
// trigger then creates the profile row. Token columns must be '' rather than null for Supabase Auth.
async function createAuthUser({ id, username }: Member) {
  const email = `${username}@example.com`;
  await db.execute(sql`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${email},
      extensions.crypt(${PASSWORD}, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    on conflict (id) do nothing`);
  await db.execute(sql`
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), ${id}, ${id}, 'email',
      ${JSON.stringify({ sub: id, email, email_verified: true })}::jsonb, now(), now(), now())
    on conflict do nothing`);
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

async function main() {
  for (const m of members) {
    await createAuthUser(m);
    await db.update(profiles).set({ username: m.username, displayName: m.displayName }).where(eq(profiles.id, m.id));
  }

  const movieIds = [...new Set(members.flatMap((m) => [...m.watched.map(([id]) => id), ...m.toWatch]))];
  const found = await Promise.all(movieIds.map(ensureMovie));
  const missing = movieIds.filter((_, i) => !found[i]);
  if (missing.length) throw new Error(`TMDB doesn't know these ids: ${missing.join(", ")}`);

  // Stagger watch dates so each member's activity is spread over the last few weeks.
  for (const [n, m] of members.entries()) {
    const watched = m.watched.map(([movieId, rating, body], i) => ({ movieId, rating, body, at: daysAgo(i * 3 + n) }));
    const list = [
      ...watched.map((w) => ({ userId: m.id, movieId: w.movieId, watchedAt: w.at })),
      ...m.toWatch.map((movieId) => ({ userId: m.id, movieId })),
    ];
    const rated = watched
      .filter((w) => w.rating !== null)
      .map((w) => ({ userId: m.id, movieId: w.movieId, rating: w.rating!, body: w.body, createdAt: w.at, updatedAt: w.at }));
    if (list.length) await db.insert(watchlist).values(list).onConflictDoNothing();
    if (rated.length) await db.insert(reviews).values(rated).onConflictDoNothing();
  }

  const edges = members.flatMap((a) => members.filter((b) => b !== a).map((b) => ({ followerId: a.id, followeeId: b.id })));
  await db.insert(follows).values(edges).onConflictDoNothing();

  console.log(`Seeded ${members.length} members. Sign in as demo@example.com / ${PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
