"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bookmark,
  ChartColumn,
  Check,
  Eye,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import type { Status } from "@/lib/queries";
import { Poster, Stars } from "@/components/ui";

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

// Client-side so the current tab can be highlighted from the URL.
export function NavLinks({ username }: { username: string | null }) {
  const pathname = usePathname();
  const links: [string, string, LucideIcon][] = [
    ["/search", "Search", Search],
    ["/watchlist", "Watchlist", Bookmark],
    ["/stats", "Stats", ChartColumn],
    ["/recommendations", "Taste profile", Sparkles],
    ["/activity", "Activity", Activity],
  ];
  if (username) links.push([`/u/${username}`, `@${username}`, User]);

  return links.map(([href, label, Icon]) => (
    <Link
      key={href}
      href={href}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${
        pathname.startsWith(href) ? "bg-yellow-100 text-zinc-900" : "hover:text-amber-400"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  ));
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

// Watchlist toggle (+ / green tick) and mark watched. Keeps its own status so it also works on the
// client-rendered taste profile page, where a refresh doesn't re-render it. Watched films are
// removed from the watched section of /watchlist instead, since that also deletes the rating.
export function ListButtons({ movieId, status: initial }: { movieId: number; status: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: Status) {
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

  if (status === "watched") {
    return (
      <p className="flex items-center gap-1 text-sm text-emerald-400">
        <Check size={16} /> Watched
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {status === null ? (
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-600 hover:border-amber-400 hover:text-amber-400 disabled:opacity-50"
            aria-label="Add to watchlist"
            title="Add to watchlist"
            disabled={busy}
            onClick={() => update("to_watch")}
          >
            <Plus size={18} />
          </button>
        ) : (
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-50"
            aria-label="On your watchlist, click to remove"
            title="On your watchlist, click to remove"
            disabled={busy}
            onClick={() => update(null)}
          >
            <Check size={18} strokeWidth={3} />
          </button>
        )}
        <button className="btn-ghost flex items-center gap-1" disabled={busy} onClick={() => update("watched")}>
          <Eye size={16} /> Mark watched
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

// 1-10 buttons, shared by the review form and the watched list.
function RatingPicker({ rating, onChange, disabled }: { rating: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} out of 10`}
          aria-pressed={n === rating}
          disabled={disabled}
          className={`h-8 w-8 rounded text-sm ${n <= rating ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 hover:bg-zinc-700"}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

type WatchedFilm = {
  movieId: number;
  title: string;
  posterPath: string | null;
  rating: number | null;
  body: string | null;
  isPublic: boolean | null;
};

// One row of the watched section: rate inline, edit the review in place, or remove the film.
export function WatchedEntry({ film }: { film: WatchedFilm }) {
  const router = useRouter();
  const [rating, setRating] = useState(film.rating ?? 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: string, url: string, body?: unknown) {
    setBusy(true);
    const err = await callApi(method, url, body);
    setBusy(false);
    setError(err);
    if (!err) router.refresh();
    return !err;
  }

  const saveReview = (newRating: number, body: string | null) =>
    send("PUT", `/api/reviews/${film.movieId}`, { rating: newRating, body, isPublic: film.isPublic ?? true });

  // Preview is the first two sentences; the "…" (or clicking the text) opens the full review for editing.
  const sentences = film.body?.split(/(?<=[.!?])\s+/) ?? [];
  const startEditing = () => {
    setDraft(film.body ?? "");
    setEditing(true);
  };

  return (
    <li className="flex gap-4 rounded-lg border border-zinc-800 p-3">
      <Link href={`/movie/${film.movieId}`} className="w-16 shrink-0">
        <Poster path={film.posterPath} title={film.title} size="w185" />
      </Link>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/movie/${film.movieId}`} className="font-semibold hover:text-amber-400">
            {film.title}
          </Link>
          <button
            className="text-zinc-400 hover:text-red-400 disabled:opacity-50"
            aria-label="Remove film"
            title="Remove film, with its rating and review"
            disabled={busy}
            onClick={() => {
              if (confirm(`Remove ${film.title}? Its rating and review will be deleted too.`)) {
                send("DELETE", `/api/watchlist/${film.movieId}`);
              }
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>

        <RatingPicker
          rating={rating}
          disabled={busy}
          onChange={async (n) => {
            if (await saveReview(n, film.body)) setRating(n);
          }}
        />

        {editing ? (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await saveReview(rating, draft)) setEditing(false);
            }}
          >
            <textarea
              autoFocus
              className="input min-h-24"
              maxLength={5000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn" disabled={busy}>Save</button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : film.body ? (
          <button className="block text-left text-sm text-zinc-300 hover:text-zinc-100" title="Click to edit" onClick={startEditing}>
            {sentences.slice(0, 2).join(" ")}
            {sentences.length > 2 && <span className="text-amber-400"> …</span>}
          </button>
        ) : rating ? (
          <button className="text-sm text-amber-400" onClick={startEditing}>+ Write a review</button>
        ) : (
          <p className="text-sm text-zinc-500">Pick a rating to add a review.</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </li>
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
        <RatingPicker rating={rating} onChange={setRating} />
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
