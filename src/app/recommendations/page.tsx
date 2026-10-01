"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TasteProfile } from "@/server/routes/recommendations";
import { ListButtons } from "@/components/actions";
import { MovieCard } from "@/components/ui";

type Result = { status: "idle" | "loading" } | ({ status: "ok" } & TasteProfile) | { status: "error"; error: string };

// Client-rendered so the page shows a loading state while TMDB + Gemini run (can take several seconds).
export default function TasteProfilePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<Result>({ status: "idle" });

  // Shows the saved profile, if there is one, without calling Gemini.
  useEffect(() => {
    fetch("/api/recommendations")
      .then((res) => (res.ok ? res.json() : null))
      .then((saved: TasteProfile | null) => {
        if (!saved) return;
        setPrompt(saved.prompt ?? "");
        setResult((r) => (r.status === "idle" ? { status: "ok", ...saved } : r));
      })
      .catch(() => {});
  }, []);

  async function generate(refresh = false) {
    setResult({ status: "loading" });
    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() || undefined, refresh }),
      });
      if (res.status === 401) return router.push("/login");
      const data = await res.json();
      setResult(res.ok ? { status: "ok", ...data } : { status: "error", error: data.error ?? "Something went wrong" });
    } catch {
      setResult({ status: "error", error: "Network error" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your taste profile</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Choose what Gemini looks at in{" "}
          <Link href="/settings?tab=preferences" className="text-amber-400">Settings &gt; Preferences</Link>.
        </p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <textarea
          className="input min-h-20"
          maxLength={300}
          placeholder="Optional: anything to steer the picks, e.g. “something light for a Friday night” or “older than 2000”"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="btn" disabled={result.status === "loading"}>
          {result.status === "ok" ? "Regenerate" : "Generate"}
        </button>
      </form>

      {result.status === "loading" && (
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-lg bg-zinc-800" />
          <p className="text-sm text-zinc-400">Reading your watch history…</p>
        </div>
      )}

      {result.status === "error" && <p className="text-red-400">{result.error}</p>}

      {result.status === "ok" && (
        <>
          <p className="text-sm text-zinc-400">
            Generated {new Date(result.generatedAt).toLocaleString()}.{" "}
            {result.cached && (
              <>
                It&apos;s reused until your films, preferences or prompt change.{" "}
                <button className="text-amber-400 hover:underline" onClick={() => generate(true)}>
                  Get new picks anyway
                </button>
              </>
            )}
          </p>
          <p className="rounded-lg border border-zinc-800 p-4 text-zinc-300">{result.tasteProfile}</p>
          <ul className="space-y-6">
            {result.picks.map((p) => (
              <li key={p.movieId} className="flex gap-4">
                <div className="w-28 shrink-0">
                  <MovieCard id={p.movieId} title={p.title} posterPath={p.posterPath} subtitle={p.year} />
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-zinc-300">{p.reason}</p>
                  <ListButtons movieId={p.movieId} status={null} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
