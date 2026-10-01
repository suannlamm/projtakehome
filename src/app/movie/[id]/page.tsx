import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviews, watchlist } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getFeed } from "@/lib/queries";
import { tmdb, type TmdbMovie } from "@/lib/tmdb";
import { ListButtons, ReviewCard } from "@/components/actions";
import { Poster, Rating } from "@/components/ui";

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id: idParam } = await params;
  if (!/^[0-9]{1,9}$/.test(idParam)) notFound();
  const id = Number(idParam);

  // Details come straight from TMDB: the film might not be in our database yet.
  const movie = await tmdb<TmdbMovie & { runtime: number | null }>(`/movie/${id}`);
  if (!movie) notFound();

  const [[mine], friends] = await Promise.all([
    db
      .select({ watchedAt: watchlist.watchedAt, rating: reviews.rating, body: reviews.body, isPublic: reviews.isPublic })
      .from(watchlist)
      .leftJoin(reviews, and(eq(reviews.userId, watchlist.userId), eq(reviews.movieId, watchlist.movieId)))
      .where(and(eq(watchlist.userId, user.id), eq(watchlist.movieId, id))),
    getFeed(user.id, id),
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
          <ListButtons movieId={id} status={mine ? (mine.watchedAt ? "watched" : "to_watch") : null} />
        </div>
      </div>

      <ReviewCard
        movieId={id}
        existing={mine?.rating ? { rating: mine.rating, body: mine.body, isPublic: mine.isPublic ?? true } : null}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Friends who watched this</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-zinc-400">No one you follow has watched this yet.</p>
        ) : (
          <ul className="space-y-3">
            {friends.map((f) => (
              <li key={f.username} className="rounded-lg border border-zinc-800 p-4">
                <p className="text-sm">
                  <Link href={`/u/${f.username}`} className="font-semibold hover:text-amber-400">
                    {f.displayName ?? `@${f.username}`}
                  </Link>{" "}
                  {f.rating ? <Rating rating={f.rating} /> : <span className="text-zinc-500">watched</span>}
                </p>
                {f.body && <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">{f.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
