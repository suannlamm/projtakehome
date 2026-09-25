-- Create a profile row for every new Supabase auth user (username is chosen later on /onboarding).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (new.id);
  RETURN new;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint
-- RLS on with no policies: the public anon key can read/write nothing through Supabase's REST API.
-- The app's server connects as the postgres role (DATABASE_URL), which bypasses RLS.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.movie_genres ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.recommendation_cache ENABLE ROW LEVEL SECURITY;
