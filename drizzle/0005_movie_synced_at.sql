ALTER TABLE "movies" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing films were copied from TMDB the first time anyone added them.
UPDATE "movies" SET "synced_at" = sub."first_added"
  FROM (SELECT "movie_id", min("added_at") AS "first_added" FROM "watchlist" GROUP BY "movie_id") sub
  WHERE sub."movie_id" = "movies"."id";
