import Link from "next/link";
import { Star } from "lucide-react";

// Presentational pieces shared by server pages and the client taste profile page.

export function Poster({ path, title, size = "w342" }: { path: string | null; title: string; size?: string }) {
  if (!path) {
    return (
      <div className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-zinc-800 p-2 text-center text-xs text-zinc-400">
        {title}
      </div>
    );
  }
  // TMDB serves pre-sized images, so a plain <img> avoids spending Vercel's image optimisation quota.
  return (
    <img
      src={`https://image.tmdb.org/t/p/${size}${path}`}
      alt={title}
      loading="lazy"
      className="aspect-[2/3] w-full rounded-md bg-zinc-800 object-cover"
    />
  );
}

// friends: handles of people you follow who have watched this film.
export function MovieCard({
  id,
  title,
  posterPath,
  subtitle,
  friends = [],
}: {
  id: number;
  title: string;
  posterPath: string | null;
  subtitle?: string;
  friends?: string[];
}) {
  return (
    <Link href={`/movie/${id}`} className="group block">
      <Poster path={posterPath} title={title} />
      <p className="mt-1 truncate text-sm group-hover:text-amber-400">{title}</p>
      {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
      {friends.length > 0 && (
        <p className="truncate text-xs text-emerald-400" title={friends.map((f) => `@${f}`).join(", ")}>
          Watched by {friends.length === 1 ? `@${friends[0]}` : `@${friends[0]} +${friends.length - 1}`}
        </p>
      )}
    </Link>
  );
}

// A 1-10 rating as one star and the number: ★ 7/10.
export function Rating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-amber-400" aria-label={`${rating} out of 10`}>
      <Star size={14} fill="currentColor" />
      {rating}
      <span className="text-xs text-zinc-500">/10</span>
    </span>
  );
}

type Stats = { watched: number; rated: number; average: number | null; genres: { genre: string; count: number }[] };

export function StatsPanel({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...stats.genres.map((g) => g.count));
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      {[
        ["Films watched", stats.watched],
        ["Films rated", stats.rated],
        ["Average rating", stats.average === null ? "–" : `${stats.average}/10`],
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg border border-zinc-800 p-4">
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
      ))}
      <div className="rounded-lg border border-zinc-800 p-4 sm:col-span-3">
        <p className="mb-3 text-sm text-zinc-400">Genres across watched films</p>
        {stats.genres.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing watched yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {stats.genres.map((g) => (
              <li key={g.genre} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="truncate">{g.genre}</span>
                <div className="h-3 rounded bg-amber-500" style={{ width: `${(g.count / max) * 100}%` }} />
                <span className="text-right text-zinc-400">{g.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
