CREATE TABLE "taste_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"input_hash" text NOT NULL,
	"prompt" text,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taste_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;