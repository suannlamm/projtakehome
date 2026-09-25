# Setup: what you need to create and where it goes

**You never edit code to plug in keys.** Every external value goes into **one file, `.env.local`**, which the code reads through `process.env`. On Vercel, the same values go into the project's Environment Variables. A few steps are dashboard settings (redirect URLs, Google provider), marked **⚙ Dashboard**.

## Checklist

| # | Create this | Gives you | Put it in `.env.local` as | Code that reads it |
|---|---|---|---|---|
| 1 | Supabase project | Project URL + anon key | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [src/lib/auth.ts:11](src/lib/auth.ts#L11), [src/proxy.ts:8](src/proxy.ts#L8), [src/app/login/page.tsx:10](src/app/login/page.tsx#L10) |
| 2 | (same project) | DB connection strings | `DATABASE_URL`, `DIRECT_URL` | [src/db/index.ts:9](src/db/index.ts#L9), [drizzle.config.ts:11](drizzle.config.ts#L11) |
| 3 | TMDB account | API Read Access Token | `TMDB_API_TOKEN` | [src/lib/tmdb.ts:18](src/lib/tmdb.ts#L18) |
| 4 | Google AI Studio | Gemini API key | `GOOGLE_GENERATIVE_AI_API_KEY` | read automatically by `@ai-sdk/google` in [src/server/routes/recommendations.ts:62](src/server/routes/recommendations.ts#L62) |
| 5 | Google Cloud OAuth client | Client ID + secret | *not in `.env.local`*: ⚙ pasted into Supabase | used by the "Continue with Google" button, [src/app/login/page.tsx:48](src/app/login/page.tsx#L48) |

Start by copying the template:

```
copy .env.example .env.local
```

---

## 1. Supabase project → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

1. Go to https://supabase.com/dashboard, click **New project** and pick a region near you. **Save the database password**, because you need it in step 2.
2. When it's ready, open **Project Settings → API** (or the **Connect** button → *App Frameworks*).
3. Copy the **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy the **anon / publishable** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Do **not** use the `service_role` / secret key anywhere.

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...   (or sb_publishable_...)
```

The anon key is meant to be public. It only lets the browser run sign-in, and RLS blocks it from reading any table.

## 2. Database connection strings → `DATABASE_URL`, `DIRECT_URL`

1. In Supabase click **Connect** (top bar) → **Connection string**.
2. **Transaction pooler** (port **6543**) goes in `DATABASE_URL`. The running app uses it, and it's needed on Vercel so serverless functions don't run out of connections.
3. **Session pooler** (port **5432**) goes in `DIRECT_URL`. It's only used when running migrations.
4. Replace `[YOUR-PASSWORD]` in both with the database password from step 1. If the password contains special characters like `@`, `#` or `/`, URL-encode them, or reset the password to a letters-and-numbers one under Project Settings → Database.

```env
DATABASE_URL=postgresql://postgres.abcdefghijkl:PASSWORD@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.abcdefghijkl:PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
```

**Then create the tables:**

```
npm run db:migrate
```

This applies [drizzle/0000_init.sql](drizzle/0000_init.sql) (all tables, keys and indexes) and [drizzle/0001_auth_trigger_rls.sql](drizzle/0001_auth_trigger_rls.sql) (the trigger that creates a profile on sign-up, plus RLS). Check in Supabase → **Table Editor** that 8 tables exist.

## 3. TMDB → `TMDB_API_TOKEN`

1. Create a free account at https://www.themoviedb.org/signup.
2. Go to **Settings → API** (https://www.themoviedb.org/settings/api) and request an API key (choose "Developer" and fill in the short form).
3. Copy the **API Read Access Token**, the long `eyJ...` one. **Not** the short "API Key".

```env
TMDB_API_TOKEN=eyJhbGciOiJIUzI1NiJ9....
```

## 4. Gemini → `GOOGLE_GENERATIVE_AI_API_KEY`

1. Go to https://aistudio.google.com/apikey and click **Create API key**.
2. Paste it in:

```env
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

The model is set in [src/server/routes/recommendations.ts:62](src/server/routes/recommendations.ts#L62) as `gemini-flash-latest`, the free-tier Flash model. Change that string if you want a different one.

## 5. Google sign-in (OAuth) ⚙ Dashboard only

This needs setting up in two places: **Google Cloud** and **Supabase**.

**In Supabase first**, go to **Authentication → Sign In / Providers → Google** and copy the **Callback URL** shown there. It looks like `https://abcdefghijkl.supabase.co/auth/v1/callback`.

**In Google Cloud** (https://console.cloud.google.com):
1. Create a project, or pick an existing one.
2. Open **APIs & Services → OAuth consent screen** (now called "Google Auth Platform").
   - User type: **External**.
   - Fill in the app name and your email.
   - Under **Audience**, add your own Google account (and any testers) as **test users**.
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** `http://localhost:3000` and later your Vercel URL, e.g. `https://your-app.vercel.app`.
   - **Authorized redirect URIs:** the Supabase **Callback URL** from above.
4. Copy the **Client ID** and **Client secret**.

**Back in Supabase → Google provider:** turn it **on**, paste the Client ID and Client secret, and click **Save**.

## 6. Supabase URL configuration ⚙ Dashboard only

Supabase will only send users back to URLs you've allowed. Go to **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000` while developing. Change it to your Vercel URL after deploying.
- **Redirect URLs:** add both of these:
  - `http://localhost:3000/auth/callback`
  - `https://your-app.vercel.app/auth/callback` (once you know the Vercel URL)

These match the `/auth/callback` route in [src/app/auth/callback/route.ts](src/app/auth/callback/route.ts), which Google sign-in and email confirmation both return to.

## 7. Email + password sign-in ⚙ Dashboard (optional tweak)

Email/password works out of the box: **Authentication → Sign In / Providers → Email** is on by default.

- With **Confirm email** on (the default), new users get a confirmation link. Supabase's built-in email sender only allows a few emails per hour on the free tier.
- For quick testing, turn **Confirm email** off and users are signed in straight after signing up.

---

## Run it locally

```
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:3000, sign up, choose a username, search for a film, and rate it.

## Deploy to Vercel

1. Push this folder to a GitHub repo, then **Import** it at https://vercel.com/new.
2. In **Settings → Environment Variables**, add the same six values from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `TMDB_API_TOKEN`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
3. Deploy, then add the Vercel URL in these places:
   - **Supabase → URL Configuration:** set the Site URL and add `https://your-app.vercel.app/auth/callback` to the Redirect URLs (step 6).
   - **Google Cloud → OAuth client:** add it to the Authorized JavaScript origins (step 5).
4. [vercel.json](vercel.json) sets up a daily cron that calls `/api/health`, which keeps the free Supabase project from pausing after a week of inactivity. Nothing to configure.

## Quick checks after setup

- **Signed-out API:** `curl -i https://your-app.vercel.app/api/feed` should return `401`. So should every other `/api/*` route except `/api/health`.
- **`/api/health`** should return `{"ok":true}`, which proves the database connection works.
- **Google sign-in and email sign-in:** try both on the deployed URL, not just localhost.
