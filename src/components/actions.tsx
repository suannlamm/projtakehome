"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Small interactive widgets. Each calls the /api routes, then refreshes the server-rendered page.

async function callApi(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return (data.error as string) ?? `Request failed (${res.status})`;
}

export function SearchInput({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  // Debounced: the URL (and so the server-rendered results) updates 300ms after typing stops.
  useEffect(() => {
    if (q === initial) return;
    const t = setTimeout(() => router.replace(`/search?q=${encodeURIComponent(q.trim())}`), 300);
    return () => clearTimeout(t);
  }, [q, initial, router]);

  return <input autoFocus className="input" placeholder="Search for a film..." value={q} onChange={(e) => setQ(e.target.value)} />;
}

export function WatchlistButton({ movieId, onWatchlist }: { movieId: number; onWatchlist: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    const err = await callApi(onWatchlist ? "DELETE" : "PUT", `/api/watchlist/${movieId}`);
    setError(err);
    setBusy(false);
    if (!err) router.refresh();
  }

  return (
    <div>
      <button className={onWatchlist ? "btn-ghost" : "btn"} disabled={busy} onClick={toggle}>
        {onWatchlist ? "✓ On watchlist" : "+ Add to watchlist"}
      </button>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

type Review = { rating: number; body: string | null; isPublic: boolean; watchedOn: string | null };

export function ReviewForm({ movieId, existing }: { movieId: number; existing: Review | null }) {
  const router = useRouter();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? true);
  const [watchedOn, setWatchedOn] = useState(existing?.watchedOn ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(method: "PUT" | "DELETE") {
    setBusy(true);
    const err = await callApi(
      method,
      `/api/reviews/${movieId}`,
      method === "PUT" ? { rating, body, isPublic, watchedOn: watchedOn || null } : undefined,
    );
    setBusy(false);
    setMessage(err ?? (method === "PUT" ? "Saved" : "Review deleted"));
    if (!err && method === "DELETE") {
      setRating(0);
      setBody("");
    }
    if (!err) router.refresh();
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-zinc-800 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit("PUT");
      }}
    >
      <h2 className="font-semibold">{existing ? "Your review" : "Rate this film"}</h2>
      <div className="flex gap-1 text-2xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} stars`}
            className={n <= rating ? "text-amber-400" : "text-zinc-600 hover:text-zinc-400"}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="input min-h-24"
        placeholder="Write a review (optional)"
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Watched on
          <input type="date" className="input w-auto" value={watchedOn} onChange={(e) => setWatchedOn(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Public (visible to other users)
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={busy || rating === 0}>
          Save
        </button>
        {existing && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => submit("DELETE")}>
            Delete
          </button>
        )}
        {message && <span className="text-sm text-zinc-400">{message}</span>}
      </div>
    </form>
  );
}

export function FollowButton({ username, isFollowing }: { username: string; isFollowing: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const err = await callApi(isFollowing ? "DELETE" : "PUT", `/api/follows/${username}`);
    setBusy(false);
    if (err) alert(err);
    else router.refresh();
  }

  return (
    <button className={isFollowing ? "btn-ghost" : "btn"} disabled={busy} onClick={toggle}>
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}

export function UsernameForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await callApi("PATCH", "/api/profile", { username });
        setBusy(false);
        setError(err);
        if (!err) {
          router.push("/");
          router.refresh();
        }
      }}
    >
      <input className="input" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn" disabled={busy}>
        Continue
      </button>
    </form>
  );
}
