import { Hono } from "hono";
import { getPosterInfo } from "@/lib/queries";
import { tmdb, type TmdbMovie } from "@/lib/tmdb";
import type { Env } from "@/server/env";

type Person = { id: number; name: string; known_for_department: string; popularity: number };
type Credit = TmdbMovie & { popularity: number; job?: string };

// Films whose title matches, plus the best-known films of the best-matching director or actor,
// each with the viewer's watchlist status and the friends who've watched it.
export const searchRoutes = new Hono<Env>().get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  if (q.length < 2) return c.json({ error: "Search needs at least 2 characters" }, 400);

  const [films, people] = await Promise.all([
    tmdb<{ results: TmdbMovie[] }>("/search/movie", { query: q, include_adult: "false" }),
    tmdb<{ results: Person[] }>("/search/person", { query: q, include_adult: "false" }),
  ]);
  // Skip the person when the query is a film's exact title, or when they're obscure (TMDB popularity
  // under 1): that drops lookalike names, e.g. "dune" matching an actor called Aggy Dune.
  const exactTitle = films?.results.some((m) => m.title.toLowerCase() === q.toLowerCase());
  const person = exactTitle
    ? undefined
    : people?.results.find((p) => p.popularity >= 1 && ["Directing", "Acting"].includes(p.known_for_department));
  const credits = person ? await tmdb<{ cast: Credit[]; crew: Credit[] }>(`/person/${person.id}/movie_credits`) : null;
  const directing = person?.known_for_department === "Directing";
  const personFilms = (directing ? credits?.crew.filter((m) => m.job === "Director") : credits?.cast) ?? [];

  // A matched person comes first: searching a name is about their films, not films with the name in the title.
  const sections = [
    {
      label: `${directing ? "Directed by" : "Starring"} ${person?.name}`,
      // Sorted by popularity; an actor can be credited twice on one film, so duplicates are dropped.
      films: [...new Map(personFilms.map((m) => [m.id, m])).values()].sort((a, b) => b.popularity - a.popularity).slice(0, 8),
    },
    { label: "Films", films: films?.results.slice(0, 10) ?? [] },
  ].filter((s) => s.films.length > 0);

  const info = await getPosterInfo(c.get("userId"), sections.flatMap((s) => s.films.map((m) => m.id)));
  return c.json({
    sections: sections.map((s) => ({
      label: s.label,
      films: s.films.map((m) => ({
        id: m.id,
        title: m.title,
        posterPath: m.poster_path,
        year: m.release_date?.slice(0, 4) ?? "",
        status: info.get(m.id)?.status ?? null,
        friends: info.get(m.id)?.friends ?? [],
      })),
    })),
  });
});
