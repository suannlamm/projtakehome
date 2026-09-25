import Link from "next/link";

// Presentational pieces shared by server pages and the client recommendations page.

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

export function MovieCard({ id, title, posterPath, subtitle }: { id: number; title: string; posterPath: string | null; subtitle?: string }) {
  return (
    <Link href={`/movie/${id}`} className="group block">
      <Poster path={posterPath} title={title} />
      <p className="mt-1 truncate text-sm group-hover:text-amber-400">{title}</p>
      {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
    </Link>
  );
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-zinc-600">{"★".repeat(5 - rating)}</span>
    </span>
  );
}
