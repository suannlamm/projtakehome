CREATE TABLE "taste_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"input_hash" text NOT NULL,
	"prompt" text,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taste_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "synced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "taste_generations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "taste_generations_on" date;--> statement-breakpoint
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Existing films were copied from TMDB the first time anyone added them.
UPDATE "movies" SET "synced_at" = sub."first_added"
  FROM (SELECT "movie_id", min("added_at") AS "first_added" FROM "watchlist" GROUP BY "movie_id") sub
  WHERE sub."movie_id" = "movies"."id";
