"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Recommendations } from "@/db/schema";
import { MovieCard } from "@/components/ui";

type Result =
  | { status: "loading" }
  | { status: "ok" } & Recommendations
  | { status: "not_enough_ratings"; needed: number }
  | { status: "no_candidates" }
  | { status: "error"; error: string };

// Client-rendered so the page shows a loading state while TMDB + Gemini run (can take several seconds).
export default function RecommendationsPage() {
  const router = useRouter();
  const [result, setResult] = useState<Result>({ status: "loading" });

  useEffect(() => {
    fetch("/api/recommendations")
      .then(async (res) => {
        if (res.status === 401) return router.push("/login");
        const data = await res.json();
        setResult(res.ok ? data : { status: "error", error: data.error ?? "Something went wrong" });
      })
      .catch(() => setResult({ status: "error", error: "Network error" }));
  }, [router]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Picked for you</h1>

      {result.status === "loading" && (
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-lg bg-zinc-800" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-zinc-800" />
            ))}
          </div>
          <p className="text-sm text-zinc-400">Reading your ratings…</p>
        </div>
      )}

      {result.status === "not_enough_ratings" && (
        <p className="text-zinc-400">
          Rate {result.needed} more film{result.needed === 1 ? "" : "s"} to get recommendations.{" "}
          <Link href="/search" className="text-amber-400">Find films</Link>
        </p>
      )}

      {result.status === "no_candidates" && (
        <p className="text-zinc-400">We couldn't find new films to suggest. Try rating a few different films.</p>
      )}

      {result.status === "error" && <p className="text-red-400">{result.error}</p>}

      {result.status === "ok" && (
        <>
          <p className="rounded-lg border border-zinc-800 p-4 text-zinc-300">{result.tasteProfile}</p>
          <ul className="space-y-4">
            {result.picks.map((p) => (
              <li key={p.movieId} className="flex gap-4">
                <div className="w-28 shrink-0">
                  <MovieCard id={p.movieId} title={p.title} posterPath={p.posterPath} subtitle={p.year} />
                </div>
                <p className="text-sm text-zinc-300">{p.reason}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
