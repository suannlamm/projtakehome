# Reel

A Letterboxd-style watchlist tracker. Search films from TMDB, keep a watchlist, mark films watched and rate them out of 10, see your stats, get an AI taste profile with recommendations, and follow friends to see what they watch.

- **Author:** YOUR NAME · runaway5262@gmail.com
- **Live:** https://YOUR-APP.vercel.app
- **Demo login:** `demo@example.com` / `reel-demo-2026`. It follows four seeded members (Sam, Mira, Jordan, Priya) who have watch histories; the demo account itself starts empty.

**Stack:** Next.js 16 (App Router) on Vercel · Supabase Postgres + Auth (Google OAuth, email/password) · Drizzle ORM (server-only) · Hono API · Gemini via the Vercel AI SDK · Tailwind.

For setup, see **[SETUP.md](SETUP.md)**. It lists every key and dashboard setting and where each one goes.

## Pages

| Page | What it does |
|---|---|
| `/` | Search bar, plus a row of recommendations once you've watched one film |
| `/search` | TMDB results as a poster grid: add to watchlist or mark watched, and see which friends watched each film |
| `/watchlist` | Watchlist on top (tick to remove, mark watched); Watched below, with your rating, a review preview, a pen to edit and a bin to remove |
| `/movie/:id` | Details, your rating and review (read-only until you click the pen), friends who watched it |
| `/stats` | Films watched, films rated, average rating, count per genre across watched films |
| `/recommendations` | AI taste profile and 3-5 picks, with an optional prompt to steer them |
| `/activity` | What the people you follow recently watched and rated, who you follow, follow requests (private accounts), and member search |
| `/u/:handle` | A member's stats and watched films (only if you follow them) |
| `/settings` | Account: handle, email, password, private account, delete account. Preferences: what the taste profile uses |

## Structure

```
src/
  proxy.ts                      refreshes the Supabase session cookie on each request
  db/schema.ts                  all tables (source of truth for migrations in drizzle/)
  lib/auth.ts                   Supabase server client, getUserId / requireUser
  lib/tmdb.ts                   TMDB fetch wrapper + ensureMovie (stores a film locally)
  lib/queries.ts                queries shared by pages and the API (stats, profile, feed, candidates…)
  app/api/[[...route]]/route.ts Hono entry: auth checked ONCE here, then mounts the routes
  server/routes/*.ts            one small file per API resource
  app/**/page.tsx               pages (Server Components read the DB directly)
  components/actions.tsx        client widgets that call the API (list buttons, rating, follow…)
  components/ui.tsx             shared presentational bits (poster, rating, movie card, stats panel)
  app/settings/forms.tsx        settings-only client widgets (email, password, toggles, delete account)
scripts/seed.ts                 mock members for the demo
```

## API

All routes except `/api/health` return **401** when signed out. That check lives in a single Hono middleware, so a route can't forget it.

| Method | Path | Does |
|---|---|---|
| PUT | `/api/watchlist/:movieId` | add to your list; `{ watched: true }` marks it watched |
| DELETE | `/api/watchlist/:movieId` | remove from your list (and its rating) |
| PUT / DELETE | `/api/reviews/:movieId` | rate (and marks watched) / delete rating: `{ rating 1-10, body?, isPublic }` |
| PUT / DELETE | `/api/follows/:handle` | follow (a request if they're private) / unfollow or cancel the request (idempotent, can't target yourself) |
| PUT / DELETE | `/api/followers/:handle` | accept / decline someone's request to follow you |
| GET | `/api/users?q=` | find members by handle or display name |
| GET | `/api/users/:handle` | profile; stats and watched films only if you follow them |
| GET | `/api/feed` | recent watches and ratings from people you follow |
| PATCH | `/api/profile` | update any of: handle, display name, `isPrivate`, `tasteUsesWatched`, `tasteUsesWatchlist` |
| DELETE | `/api/profile` | delete your account (everything you own cascades from the auth user) |
| POST | `/api/recommendations` | AI taste profile + 3-5 picks: `{ prompt? }` |
| GET | `/api/health` | DB ping (public; used by the daily cron) |

## Design decisions

### Schema and keys
- **Every row is keyed by the stable Supabase user id**, never an email or handle. `profiles.id` is a foreign key to `auth.users.id`, and a trigger creates the profile on sign-up.
- **Composite primary keys** on `watchlist (user_id, movie_id)`, `reviews (user_id, movie_id)`, `follows (follower_id, followee_id)` and `movie_genres (movie_id, genre_id)`, so the database itself prevents duplicates.
- **Watched and rated are separate states.** A `watchlist` row is "to watch" while `watched_at` is null and "watched" once it's set. A rating lives in `reviews`, whose foreign key points at the `watchlist` row: a rating can't exist without its film on your list, and removing the film removes the rating. Rating a film marks it watched.
- **Movies and genres are stored locally, keyed by TMDB id**, when a film is first added. Stats come from saved data, and genres are a proper many-to-many join.
- **Check constraints** enforce the rules in the database: rating between 1 and 10, no self-follows, and the handle format.

### Privacy
- **User ids never reach the browser.** Members are addressed by handle in every URL and response, and every query picks its columns explicitly.
- **Private accounts** (`profiles.is_private`) turn a follow into a request: `follows.accepted` stays false until they accept, and only accepted follows count anywhere. Going public accepts every pending request.
- **You only see the data of people you follow.** Anyone signed in can find a member and see their handle and follower counts, but their watched films, ratings and stats need a follow. The same goes for the feed, "friends who watched this" and poster-grid markers.
- **Follows key on user ids,** so changing a handle doesn't lose followers.
- **RLS is enabled with no policies,** so Supabase's public anon key can't read any table. Only the server, connecting as `postgres`, can.
- **TMDB and Gemini keys are server-only.**

### Recommendations
- **Home page row:** TMDB's `/movie/{id}/recommendations` for your best-rated watched films, minus anything already on your list. No AI, so it's instant.
- **Taste profile:** the same TMDB candidates go to Gemini with your watch history and ratings, and your to-watch list (each can be switched off in Settings > Preferences). Gemini writes a taste profile and picks 3-5 of them with a one-line reason each. Any pick that isn't a real candidate is thrown away, so it can't recommend made-up films. Your optional prompt is passed as a preference, not as instructions.

## Assumptions
- Movies only (no TV).
- Ratings are whole numbers from 1 to 10, shown as a star and the number (★ 7/10).
- Un-marking a film as watched removes it from your lists, along with its rating and review.
- One rating per member per film; editing replaces it, and rewatches aren't logged.
- A member's "to watch" list is private; followers see what they've watched and their public ratings.
- A rating can be marked "not visible to followers": it still counts in your own stats, but not in the stats others see.
- The feed shows watched and rated films, not "added to watchlist".
- The taste profile is generated on demand (not cached), and needs at least one watched film.
- Handles are unique, lowercase, 3-20 characters; a taken handle is rejected and the user picks another.
- Accounts are public by default. Making an account private doesn't remove existing followers.
- Email and password changes go straight to Supabase Auth from the browser; an email change needs confirming by email.
