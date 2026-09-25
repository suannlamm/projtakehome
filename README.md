# Reel

Search films from TMDB, keep a watchlist, rate and review films (public or private), follow other users, see their activity in a feed, and get AI recommendations based on your ratings.

**Stack:** Next.js 16 (App Router) on Vercel · Supabase Postgres + Auth (Google OAuth, email/password) · Drizzle ORM (server-only) · Hono API · Gemini via the Vercel AI SDK · Tailwind.

For setup, see **[SETUP.md](SETUP.md)**. It lists every key and dashboard setting and where each one goes.

## Structure

```
src/
  proxy.ts                      refreshes the Supabase session cookie on each request
  db/schema.ts                  all tables (source of truth for migrations in drizzle/)
  db/index.ts                   Drizzle client
  lib/auth.ts                   Supabase server client, getUserId / requireUser
  lib/tmdb.ts                   TMDB fetch wrapper + ensureMovie (stores a film locally)
  lib/queries.ts                profile+stats and feed queries (shared by pages and API)
  app/api/[[...route]]/route.ts Hono entry: auth checked ONCE here, then mounts the routes
  server/routes/*.ts            one small file per API resource
  app/**/page.tsx               pages (Server Components read the DB directly)
  components/actions.tsx        client widgets that call the API (watchlist, review, follow…)
  components/ui.tsx             shared presentational bits (poster, stars, movie card)
```

## API

All routes except `/api/health` return **401** when signed out. That check lives in a single Hono middleware, so a route can't forget it.

| Method | Path | Does |
|---|---|---|
| PUT / DELETE | `/api/watchlist/:movieId` | add / remove a film from your watchlist |
| PUT / DELETE | `/api/reviews/:movieId` | create-or-update / delete your review `{ rating 1-5, body?, isPublic, watchedOn? }` |
| PUT / DELETE | `/api/follows/:username` | follow / unfollow |
| GET | `/api/users/:username` | profile, stats, reviews, watchlist |
| GET | `/api/feed` | latest public reviews from people you follow |
| PATCH | `/api/profile` | set your username `{ username }` |
| GET | `/api/recommendations` | AI taste profile + 3–5 picks |
| GET | `/api/health` | DB ping (public; used by the daily cron) |

## Design decisions

### Schema and keys
- **Composite primary keys** on `watchlist (user_id, movie_id)`, `reviews (user_id, movie_id)`, `follows (follower_id, followee_id)` and `movie_genres (movie_id, genre_id)`. The database itself prevents duplicates, and the key documents the relationship.
- **`profiles.id` is a foreign key to Supabase's `auth.users.id`**, with `on delete cascade`. A trigger creates the profile on sign-up.
- **Movies and genres are stored locally, keyed by TMDB id**, when a film is first watchlisted or reviewed. Stats come from saved data, and genres are a proper many-to-many join (`genres` ↔ `movie_genres`).
- **Watchlist and reviews are separate tables.** You can rate a film you never watchlisted, and removing a film from your watchlist keeps its review. There's one review per user per film; editing replaces it, and rewatches aren't logged.
- **Check constraints** enforce the rules in the database, not just in the app: rating between 1 and 5, no self-follows, and the username format.

### Privacy
- **User ids never reach the browser.** Users are addressed by username in every URL and response, and every query picks its columns explicitly.
- **Private reviews are only returned to their author.** Stats that other people see are computed from public reviews only, so a private rating can't leak through an average.
- **RLS is enabled with no policies,** so Supabase's public anon key can't read any table. Only the server, connecting as `postgres`, can.
- **TMDB and Gemini keys are server-only.**

### Recommendations
The approach is hybrid. TMDB's `/movie/{id}/recommendations` for your top-rated films supplies real candidates, and Gemini writes a taste profile and picks 3–5 of them with reasons. Any pick that isn't a real candidate is thrown away, so recommendations can't be made-up films. Results are cached per user against a hash of their rating history and regenerate only when ratings change.
