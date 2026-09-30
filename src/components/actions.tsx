"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Status } from "@/lib/queries";
import { Stars } from "@/components/ui";

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

// Add to watchlist / mark watched / remove. Keeps its own status so it also works on the
// client-rendered taste profile page, where a refresh doesn't re-render it.
export function ListButtons({ movieId, status: initial }: { movieId: number; status: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: Status) {
    if (next === null && status === "watched" && !confirm("Remove this film? Its rating will be deleted too.")) return;
    setBusy(true);
    const err = await callApi(
      next === null ? "DELETE" : "PUT",
      `/api/watchlist/${movieId}`,
      next === "watched" ? { watched: true } : undefined,
    );
    setBusy(false);
    setError(err);
    if (err) return;
    setStatus(next);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === null && (
          <button className="btn" disabled={busy} onClick={() => update("to_watch")}>
            + Watchlist
          </button>
        )}
        {status !== "watched" && (
          <button className="btn-ghost" disabled={busy} onClick={() => update("watched")}>
            ✓ Watched
          </button>
        )}
        {status !== null && (
          <button className="btn-ghost" disabled={busy} onClick={() => update(null)}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

type Review = { rating: number; body: string | null; isPublic: boolean };

export function ReviewForm({ movieId, existing }: { movieId: number; existing: Review | null }) {
  const router = useRouter();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(method: "PUT" | "DELETE") {
    setBusy(true);
    const err = await callApi(method, `/api/reviews/${movieId}`, method === "PUT" ? { rating, body, isPublic } : undefined);
    setBusy(false);
    setMessage(err ?? (method === "PUT" ? "Saved" : "Rating deleted"));
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
      <h2 className="font-semibold">{existing ? "Your rating" : "Rate this film"}</h2>
      <div className="flex flex-wrap items-center gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} out of 10`}
            className={`h-8 w-8 rounded text-sm ${n <= rating ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 hover:bg-zinc-700"}`}
            onClick={() => setRating(n)}
          >
            {n}
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-xl">
            <Stars rating={rating} />
          </span>
        )}
      </div>
      <textarea
        className="input min-h-24"
        placeholder="Write a review (optional)"
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        Visible to your followers
      </label>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={busy || rating === 0}>
          Save
        </button>
        {existing && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => submit("DELETE")}>
            Delete rating
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

export function ProfileForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await callApi("PATCH", "/api/profile", { username, displayName });
        setBusy(false);
        setError(err);
        if (!err) {
          router.push("/");
          router.refresh();
        }
      }}
    >
      <input className="input" placeholder="handle" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input
        className="input"
        placeholder="Display name (optional)"
        maxLength={50}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn" disabled={busy}>
        Continue
      </button>
    </form>
  );
}
