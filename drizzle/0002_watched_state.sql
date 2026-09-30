ALTER TABLE "recommendation_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "recommendation_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_rating_range";--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_movie_id_movies_id_fk";
--> statement-breakpoint
DROP INDEX "reviews_movie_id_idx";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN "watched_at" timestamp with time zone;--> statement-breakpoint
-- Existing data: a rated film counts as watched, and 1-5 star ratings move to the 1-10 scale.
INSERT INTO "watchlist" ("user_id", "movie_id", "watched_at")
  SELECT "user_id", "movie_id", "updated_at" FROM "reviews"
  ON CONFLICT ("user_id", "movie_id") DO UPDATE SET "watched_at" = coalesce("watchlist"."watched_at", excluded."watched_at");--> statement-breakpoint
UPDATE "reviews" SET "rating" = "rating" * 2;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_movie_id_watchlist_user_id_movie_id_fk" FOREIGN KEY ("user_id","movie_id") REFERENCES "public"."watchlist"("user_id","movie_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watchlist_movie_id_idx" ON "watchlist" USING btree ("movie_id");--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "watched_on";--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 10);