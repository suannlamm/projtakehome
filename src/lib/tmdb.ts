import { eq } from "drizzle-orm";
import { db } from "@/db";
import { genres, movieGenres, movies } from "@/db/schema";

export type TmdbMovie = {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview: string;
  vote_average: number;
  genres?: { id: number; name: string }[]; // only on /movie/{id}
};

// Thrown when TMDB is down, unreachable or rate-limiting us; the API turns it into a 502.
export class TmdbError extends Error {}

// Server-only: the token never reaches the browser. Returns null on 404.
export async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const res = await fetch(`https://api.themoviedb.org/3${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` },
    next: { revalidate: 3600 },
  }).catch((err) => {
    throw new TmdbError(`TMDB unreachable on ${path}`, { cause: err });
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new TmdbError(`TMDB ${res.status} on ${path}`);
  return res.json();
}

// Makes sure a movie (and its genres) exists locally before a watchlist/review row references it.
// Details always come from TMDB, never from the client. Returns false if TMDB doesn't know the id.
export async function ensureMovie(id: number) {
  const [existing] = await db.select({ id: movies.id }).from(movies).where(eq(movies.id, id));
  if (existing) return true;

  const m = await tmdb<TmdbMovie>(`/movie/${id}`);
  if (!m) return false;

  await db.transaction(async (tx) => {
    await tx
      .insert(movies)
      .values({
        id: m.id,
        title: m.title,
        posterPath: m.poster_path,
        releaseDate: m.release_date || null,
        overview: m.overview,
      })
      .onConflictDoNothing();
    if (m.genres?.length) {
      await tx.insert(genres).values(m.genres).onConflictDoNothing();
      await tx
        .insert(movieGenres)
        .values(m.genres.map((g) => ({ movieId: m.id, genreId: g.id })))
        .onConflictDoNothing();
    }
  });
  return true;
}
