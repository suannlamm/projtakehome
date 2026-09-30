import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getPosterInfo } from "@/lib/queries";
import { tmdb, type TmdbMovie } from "@/lib/tmdb";
import { ListButtons, SearchInput } from "@/components/actions";
import { MovieCard } from "@/components/ui";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;

  return (
    <div className="space-y-6">
      <SearchInput initial={q} />
      {q && (
        // key={q} re-shows the skeleton for each new query.
        <Suspense key={q} fallback={<Skeleton />}>
          <Results q={q} userId={user.id} />
        </Suspense>
      )}
    </div>
  );
}

async function Results({ q, userId }: { q: string; userId: string }) {
  const data = await tmdb<{ results: TmdbMovie[] }>("/search/movie", { query: q, include_adult: "false" });
  const results = data?.results ?? [];
  if (results.length === 0) return <p className="text-zinc-400">No films found for “{q}”.</p>;
  const info = await getPosterInfo(userId, results.map((m) => m.id));

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
      {results.map((m) => (
        <div key={m.id} className="space-y-2">
          <MovieCard
            id={m.id}
            title={m.title}
            posterPath={m.poster_path}
            subtitle={m.release_date?.slice(0, 4)}
            friends={info.get(m.id)?.friends}
          />
          <ListButtons movieId={m.id} status={info.get(m.id)?.status ?? null} />
        </div>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-zinc-800" />
      ))}
    </div>
  );
}
