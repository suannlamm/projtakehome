import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { profiles, reviews, watchlist } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { tmdb, type TmdbMovie } from "@/lib/tmdb";
import { ReviewForm, WatchlistButton } from "@/components/actions";
import { Poster, Stars } from "@/components/ui";

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id: idParam } = await params;
  if (!/^[0-9]{1,9}$/.test(idParam)) notFound();
  const id = Number(idParam);

  // Details come straight from TMDB: the film might not be in our database yet.
  const movie = await tmdb<TmdbMovie & { runtime: number | null }>(`/movie/${id}`);
  if (!movie) notFound();

  const [[onWatchlist], [myReview], otherReviews] = await Promise.all([
    db
      .select({ movieId: watchlist.movieId })
      .from(watchlist)
      .where(and(eq(watchlist.userId, user.id), eq(watchlist.movieId, id))),
    db
      .select({ rating: reviews.rating, body: reviews.body, isPublic: reviews.isPublic, watchedOn: reviews.watchedOn })
      .from(reviews)
      .where(and(eq(reviews.userId, user.id), eq(reviews.movieId, id))),
    // Other people's reviews: public only, and identified by username, never id.
    db
      .select({ username: profiles.username, rating: reviews.rating, body: reviews.body, updatedAt: reviews.updatedAt })
      .from(reviews)
      .innerJoin(profiles, eq(profiles.id, reviews.userId))
      .where(and(eq(reviews.movieId, id), eq(reviews.isPublic, true), ne(reviews.userId, user.id)))
      .orderBy(desc(reviews.updatedAt))
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-48 shrink-0">
          <Poster path={movie.poster_path} title={movie.title} size="w500" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">
            {movie.title} <span className="font-normal text-zinc-400">{movie.release_date?.slice(0, 4)}</span>
          </h1>
          <p className="text-sm text-zinc-400">
            {movie.genres?.map((g) => g.name).join(", ")}
            {movie.runtime ? ` · ${movie.runtime} min` : ""}
          </p>
          <p className="text-zinc-300">{movie.overview}</p>
          <WatchlistButton movieId={id} onWatchlist={Boolean(onWatchlist)} />
        </div>
      </div>

      <ReviewForm movieId={id} existing={myReview ?? null} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Reviews from others</h2>
        {otherReviews.length === 0 ? (
          <p className="text-sm text-zinc-400">No public reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {otherReviews.map((r) => (
              <li key={r.username} className="rounded-lg border border-zinc-800 p-4">
                <p className="text-sm">
                  <Link href={`/u/${r.username}`} className="font-semibold hover:text-amber-400">@{r.username}</Link>{" "}
                  <Stars rating={r.rating} />
                </p>
                {r.body && <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
