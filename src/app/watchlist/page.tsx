import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { movies, reviews, watchlist } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ListButtons } from "@/components/actions";
import { MovieCard, Stars } from "@/components/ui";

export default async function WatchlistPage() {
  const user = await requireUser();
  const rows = await db
    .select({
      movieId: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      watchedAt: watchlist.watchedAt,
      rating: reviews.rating,
    })
    .from(watchlist)
    .innerJoin(movies, eq(movies.id, watchlist.movieId))
    .leftJoin(reviews, and(eq(reviews.userId, watchlist.userId), eq(reviews.movieId, watchlist.movieId)))
    .where(eq(watchlist.userId, user.id))
    .orderBy(desc(sql`coalesce(${watchlist.watchedAt}, ${watchlist.addedAt})`));

  const toWatch = rows.filter((r) => !r.watchedAt);
  const watched = rows.filter((r) => r.watchedAt);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-bold">To watch ({toWatch.length})</h1>
        {toWatch.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Nothing here. <Link href="/" className="text-amber-400">Search for a film</Link> to add one.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {toWatch.map((r) => (
              <div key={r.movieId} className="space-y-2">
                <MovieCard id={r.movieId} title={r.title} posterPath={r.posterPath} />
                <ListButtons movieId={r.movieId} status="to_watch" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Watched ({watched.length})</h2>
        {watched.length === 0 ? (
          <p className="text-sm text-zinc-400">Films you mark as watched show up here, ready to rate.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {watched.map((r) => (
              <div key={r.movieId} className="space-y-2">
                <MovieCard id={r.movieId} title={r.title} posterPath={r.posterPath} />
                {r.rating ? (
                  <Stars rating={r.rating} />
                ) : (
                  <Link href={`/movie/${r.movieId}`} className="block text-sm text-amber-400">Rate it →</Link>
                )}
                <ListButtons movieId={r.movieId} status="watched" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
