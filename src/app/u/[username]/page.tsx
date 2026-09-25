import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { FollowButton } from "@/components/actions";
import { MovieCard, Poster, Stars } from "@/components/ui";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const user = await requireUser();
  const profile = await getProfile((await params).username, user.id);
  if (!profile) notFound();

  const { stats } = profile;
  const maxBar = Math.max(1, ...stats.distribution);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold">@{profile.username}</h1>
        <p className="text-sm text-zinc-400">
          {profile.followers} followers · {profile.following} following
        </p>
        {!profile.isOwner && <FollowButton username={profile.username} isFollowing={profile.isFollowing} />}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="text-sm text-zinc-400">Films rated</p>
          <p className="text-3xl font-bold">{stats.rated}</p>
          <p className="mt-2 text-sm text-zinc-400">Average rating</p>
          <p className="text-3xl font-bold">{stats.average ?? "–"}</p>
          <p className="mt-2 text-sm text-zinc-400">On watchlist: {stats.watchlistSize}</p>
        </div>

        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="mb-2 text-sm text-zinc-400">Rating distribution</p>
          {stats.distribution.map((count, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-6">{i + 1}★</span>
              <div className="h-3 rounded bg-amber-500" style={{ width: `${(count / maxBar) * 100}%`, minWidth: count ? 4 : 0 }} />
              <span className="text-zinc-400">{count}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="mb-2 text-sm text-zinc-400">Top genres</p>
          {stats.topGenres.length === 0 ? (
            <p className="text-sm text-zinc-500">No ratings yet</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {stats.topGenres.map((g) => (
                <li key={g.genre} className="flex justify-between">
                  <span>{g.genre}</span>
                  <span className="text-zinc-400">{g.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Reviews</h2>
        {profile.reviews.length === 0 ? (
          <p className="text-sm text-zinc-400">No reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {profile.reviews.map((r) => (
              <li key={r.movieId} className="flex gap-4 rounded-lg border border-zinc-800 p-4">
                <Link href={`/movie/${r.movieId}`} className="w-14 shrink-0">
                  <Poster path={r.posterPath} title={r.title} size="w154" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link href={`/movie/${r.movieId}`} className="font-semibold hover:text-amber-400">{r.title}</Link>{" "}
                    <Stars rating={r.rating} />
                    {!r.isPublic && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">Private</span>}
                  </p>
                  {r.body && <p className="mt-1 whitespace-pre-line text-sm text-zinc-300">{r.body}</p>}
                  <p className="mt-1 text-xs text-zinc-500">
                    {r.watchedOn ? `Watched ${r.watchedOn}` : `Updated ${r.updatedAt.toLocaleDateString()}`}
                    {profile.isOwner && (
                      <Link href={`/movie/${r.movieId}`} className="ml-2 text-amber-400">Edit</Link>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Watchlist</h2>
        {profile.watchlist.length === 0 ? (
          <p className="text-sm text-zinc-400">Nothing on the watchlist.</p>
        ) : (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-6">
            {profile.watchlist.map((w) => (
              <MovieCard key={w.movieId} id={w.movieId} title={w.title} posterPath={w.posterPath} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
