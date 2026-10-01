import { requireUser } from "@/lib/auth";
import { getList } from "@/lib/queries";
import { ListButtons, WatchedEntry } from "@/components/actions";
import { MovieCard } from "@/components/ui";

export default async function WatchlistPage() {
  const user = await requireUser();
  const rows = await getList(user.id);

  const toWatch = rows.filter((r) => !r.watchedAt);
  const watched = rows.filter((r) => r.watchedAt);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-bold">Watchlist ({toWatch.length})</h1>
        {toWatch.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Nothing here. Use the search at the top to find a film and add it.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
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
          <p className="text-sm text-zinc-400">Films you mark as watched move here, ready to rate.</p>
        ) : (
          <ul className="space-y-3">
            {watched.map((r) => (
              <WatchedEntry key={r.movieId} film={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
