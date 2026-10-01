import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { getCandidates, getPosterInfo, getWatchedHistory } from "@/lib/queries";
import { SearchButton } from "@/components/actions";
import { MovieCard } from "@/components/ui";

export default async function HomePage() {
  if (!(await getCurrentUser())) {
    return (
      <section className="py-20 text-center">
        <h1 className="text-4xl font-bold">Keep track of every film you watch.</h1>
        <p className="mt-3 text-zinc-400">Build a watchlist, rate films, follow friends, and get AI picks based on your taste.</p>
        <Link href="/login" className="btn mt-8 inline-block">Get started</Link>
      </section>
    );
  }

  const user = await requireUser();
  return (
    <div className="flex flex-col items-center gap-12 pt-[12vh]">
      <div className="w-full max-w-xl">
        <SearchButton bar />
      </div>
      <Suspense fallback={<RowSkeleton />}>
        <ForYou userId={user.id} />
      </Suspense>
    </div>
  );
}

// No AI here, so it's instant: TMDB's recommendations for the user's best-rated watched films.
async function ForYou({ userId }: { userId: string }) {
  const history = await getWatchedHistory(userId);
  if (history.length === 0) {
    return <p className="text-sm text-zinc-400">Mark a film as watched and recommendations will appear here.</p>;
  }

  const picks = (await getCandidates(userId, history.slice(0, 5).map((h) => h.movieId))).slice(0, 15);
  if (picks.length === 0) return null;
  const info = await getPosterInfo(userId, picks.map((m) => m.id));

  return (
    <section className="w-full min-w-0">
      <h2 className="mb-3 text-sm font-semibold text-zinc-400">
        Recommended from your {history.length} watched film{history.length === 1 ? "" : "s"}
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {picks.map((m) => (
          <div key={m.id} className="w-28 shrink-0 sm:w-32">
            <MovieCard
              id={m.id}
              title={m.title}
              posterPath={m.poster_path}
              subtitle={m.release_date?.slice(0, 4)}
              friends={info.get(m.id)?.friends}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function RowSkeleton() {
  return (
    <div className="flex w-full gap-4 overflow-hidden">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="aspect-[2/3] w-28 shrink-0 animate-pulse rounded-md bg-zinc-800 sm:w-32" />
      ))}
    </div>
  );
}
