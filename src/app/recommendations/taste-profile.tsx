"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TasteProfile, Usage } from "@/server/routes/recommendations";
import { ListButtons } from "@/components/actions";
import { MovieCard } from "@/components/ui";

// The interactive part of the taste profile page. It starts from the saved profile the server
// rendered, with an empty prompt box, and shows a loading state while TMDB + Gemini run.
// An error is shown above the last profile rather than replacing it.
export function TasteProfileView({ initial }: { initial: { profile: TasteProfile | null; usage: Usage } }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [profile, setProfile] = useState(initial.profile);
  const [usage, setUsage] = useState(initial.usage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(body: { prompt?: string; refresh?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) return router.push("/login");
      // A reply that isn't JSON comes from the hosting platform, e.g. its timeout page.
      const data = await res.json().catch(() => null);
      if (!data) return setError("The request took too long or failed. Try again in a minute.");
      if (data.usage) setUsage(data.usage);
      if (res.ok) setProfile(data.profile);
      else setError(data.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          generate({ prompt: prompt.trim() || undefined });
        }}
      >
        <textarea
          className="input min-h-20"
          maxLength={300}
          placeholder="Optional: anything to steer the picks, e.g. “something light for a Friday night” or “older than 2000”"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="btn" disabled={loading}>
          {profile ? "Regenerate" : "Generate"}
        </button>
      </form>

      {error && <p className="text-red-400">{error}</p>}

      {loading ? (
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-lg bg-zinc-800" />
          <p className="text-sm text-zinc-400">Reading your watch history…</p>
        </div>
      ) : (
        profile && (
          <>
            <p className="text-sm text-zinc-400">
              {profile.cached ? "Your last taste profile, generated" : "Generated"}{" "}
              {new Date(profile.generatedAt).toLocaleString()}
              {profile.prompt ? ` for “${profile.prompt}”` : ""}.{" "}
              {profile.cached && (
                <>
                  It&apos;s reused until your films, preferences or prompt change.{" "}
                  <button
                    className="text-amber-400 hover:underline"
                    onClick={() => generate({ prompt: profile.prompt ?? undefined, refresh: true })}
                  >
                    Get new picks anyway
                  </button>
                </>
              )}
            </p>
            <p className="rounded-lg border border-zinc-800 p-4 text-zinc-300">{profile.tasteProfile}</p>
            <ul className="space-y-6">
              {profile.picks.map((p) => (
                <li key={p.movieId} className="flex gap-4">
                  <div className="w-28 shrink-0">
                    <MovieCard id={p.movieId} title={p.title} posterPath={p.posterPath} subtitle={p.year} />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-300">{p.reason}</p>
                    <ListButtons movieId={p.movieId} status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      )}

      <p
        className="fixed bottom-4 left-4 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300"
        title="Resets at midnight UTC. Showing a saved profile doesn't count."
      >
        Generations today: {usage.used}/{usage.limit}
      </p>
    </>
  );
}
