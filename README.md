# Reel

A Letterboxd-style watchlist tracker. Search films from TMDB, keep a watchlist, mark films watched and rate them out of 10, see your stats, get an AI taste profile with recommendations, and follow friends to see what they watch.
- **Name and Email:** `suann slam0051@student.monash.edu`
- **Deployed project:** `https://projtakehome.vercel.app/`
- **Demo login:** `demo@example.com` / `reel-demo-2026`. It follows four seeded members (Sam, Mira, Jordan, Priya) who have watch histories;

**Stack:** Next.js 16 (App Router) on Vercel · Supabase Postgres + Auth (Google OAuth, email/password) · Drizzle ORM (server-only) · Hono API · Gemini via the Vercel AI SDK · Tailwind.

For setup to run it locally, see **[SETUP.md](SETUP.md)**. It lists every key and dashboard setting and where each one goes.

## Checks

| Command | Does |
|---|---|
| `npm run lint` | ESLint with Next.js's recommended rules |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest. The social rules run against the real migrations in an in-memory Postgres ([PGlite](https://pglite.dev)): following is idempotent and can't target yourself, a renamed handle keeps its followers, private accounts' requests, you only see films, ratings and feed entries of people you follow, and no response ever contains a user id. Also: every API endpoint returns 401 when signed out and 403 before a handle is set (except the route that sets one), malformed requests are rejected with a readable message, a TMDB outage returns a clear 502, and the taste profile falls back through its models in order and drops made-up picks. TMDB and Gemini are mocked, so tests need no keys and never use the AI quota. |

| `npm run test:e2e` | Playwright, in a real browser against the running app and the Supabase project in `.env.local`. It creates temporary `e2e-*@example.com` accounts, walks through the app (sign-in errors, onboarding with a taken handle, search, watchlist, rating, the home row updating, stats, following someone and seeing their films, the taste profile and its 0/2 counter, sign-out) and checks no API response contains a user id, then deletes the accounts. It uses one real Gemini request per run, so it isn't part of CI. |

**CI/CD:** GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, tests and a production build on every push and pull request. Vercel deploys `main` through its Git integration.

## Side Note
- if you want to sign up through google accounts, provide me an email address to add as a test user since this is not a published app and is still in testing under google console!

## Assumptions and Overall Flow of things

### Films and ratings
- Movies only (no TV).
- A film's details are copied from TMDB the first time anyone adds it, and `movies.synced_at` records when. They aren't refreshed afterwards (titles and posters rarely change).
- Ratings are whole numbers from 1 to 10, shown as a star and the number (★ 7/10).
- One rating per member per film; editing replaces it, and rewatches aren't logged.
- Watched and rated are separate: a film can be watched without a rating, and rating a film marks it watched. A review can't be saved without a rating; trying shows "Pick a rating from 1 to 10 before saving".
- Un-marking a film as watched removes it from your lists, along with its rating and review.
- A rating can be marked "not visible to followers": it still counts in your own stats, but followers don't see it, and it's left out of the stats they see.

### Profiles, privacy and following
- Any signed-in member can find others by handle or display name and see their handle, display name and follower counts. Watched films, ratings, reviews and stats need an accepted follow, and so do the feed, "friends who watched this" and the "watched by" markers in search.
- Accounts are public by default, so a follow takes effect straight away. A member can make their account private, which turns new follows into requests they accept or decline. A pending request shows nothing more than not following, and isn't counted as a follower. Going private keeps existing followers; going public accepts every pending request.
- A member's "to watch" list is never shown to anyone else; followers see only what they've watched.
- The feed shows films watched and rated by people you follow, not "added to watchlist".
- Following is idempotent: following someone you already follow (or have already sent a request to) changes nothing, and unfollowing someone you don't follow quietly succeeds. Following yourself is refused.
- A signed-in account can't do anything through the API until it has a handle, except set one: every route but `PATCH /api/profile` (and `DELETE`, to escape a broken signup) returns 403 until onboarding is done. Supabase Auth creates the account before a handle exists (there's no way to collect one mid-OAuth-redirect), so this closes that window rather than leaving it to the UI's `/onboarding` redirect alone.
- Handles are unique, 3-20 characters of lowercase letters, numbers and underscores, and matched case-insensitively (`/u/Ben` is `/u/ben`). A taken handle is rejected and the user picks another.
- Follows are stored against user ids, so changing your handle keeps your followers. Links to the old handle stop working, and the old handle becomes free for someone else.
- Deleting an account deletes its lists, ratings and follows in both directions.

### Recommendations
- The home page row is TMDB's recommendations for your best-rated watched films, minus anything already on your list. It uses no AI. The row is cached per member for up to an hour, and cleared the moment they add, remove or rate a film. The "watched by" friend markers on it aren't cached, so they're always current.
- The taste profile needs at least one film from what's ticked in Settings > Preferences (watched films, the "to watch" list, or both).
- Each member's latest taste profile is saved (`taste_profiles`) with a hash of everything Gemini was given: watched films, ratings and reviews, the "to watch" list, which films are already on the list, and the prompt. The page opens with an empty prompt box and the saved profile below it, labelled with the prompt it was made with. Generating again with none of that changed reuses it instead of calling Gemini. "Get new picks anyway" skips the saved one. A failed attempt isn't saved.
- **Each member can generate 2 taste profiles a day.** The whole app shares one Gemini API key on the free tier, which allows only a small number of requests per model per day. Without a per-member limit, one person regenerating repeatedly could use up the day's quota and leave the taste profile broken for everyone else. A counter in the bottom-left of the taste profile page shows how many of today's 2 are used. Only actual Gemini calls count: showing a saved profile is free, and an attempt where every model fails is given back. Days reset at midnight UTC (the database clock), and the count is taken in a single database update, so sending several requests at once can't get past it.
- Gemini picks from up to 60 TMDB candidates related to your films. When you add a prompt (up to 300 characters), it may also name films outside those candidates that fit it better. Each of those is looked up on TMDB and dropped if it isn't found, so made-up films never appear; films already on your list are dropped too.
- Gemini returns 5 to 8 picks, and the first 5 that survive are shown, each with a one-line reason that names a film from your history or watchlist. If most of them are dropped, fewer than 3 can appear.
- Your prompt is treated as a preference, not as instructions to the model.
- The taste profile tries `gemini-3.8-flash`, then falls back to `gemini-3.7-flash`, `gemini-3.5-flash` and `gemini-3.5-flash-lite` if a model fails (overloaded, quota used up, unavailable, too slow, or a reply that doesn't fit the expected format). A model is never retried. Each gets at most 20 seconds and all of them together at most 45, so a request always finishes inside Vercel's 60-second limit. A missing or rejected API key stops at the first model, since no other model would work.
- The error says why: the usage limit is reached (only when every model hit its quota), the AI took too long, the AI isn't set up correctly, or it's unavailable. If every pick Gemini made is dropped, nothing is saved and the user is asked to try again. Whenever no profile is saved, for any reason, that attempt doesn't count towards the daily limit.
- Search shows people's films only for a reasonably well-known director or actor (TMDB popularity of at least 1), and not when the query is a film's exact title.

### Accounts and errors
- Email and password changes go straight to Supabase Auth from the browser; an email change needs confirming by email.
- Signing up with an email that already has an account (including one created through Google) shows "There's already an account associated with that email", rather than a "check your email" message for an email that never arrives. This favours clarity over hiding which emails are registered.
- TMDB outages and rate limits aren't retried. The API returns a 502 saying TMDB isn't responding, and pages show an error screen with a "Try again" button.
- Errors appear in red next to what caused them: a wrong email or password, an unconfirmed email, a review without a rating, a taken handle, a lost connection.
