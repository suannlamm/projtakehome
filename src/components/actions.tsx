"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bookmark,
  ChartColumn,
  Check,
  ChevronDown,
  Eye,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FollowStatus, Status } from "@/lib/queries";
import { Poster, Rating } from "@/components/ui";

// Small interactive widgets. Each calls the /api routes, then refreshes the server-rendered page.

// Returns null on success, or a message to show the user.
export async function callApi(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!res) return "Couldn't reach the server. Check your connection and try again.";
  if (res.ok) return null;
  // The session ran out while the page was open; reloading takes them to sign in.
  if (res.status === 401) return "You've been signed out. Reload the page to sign in again.";
  const data = await res.json().catch(() => ({}));
  return (data.error as string) ?? `Request failed (${res.status})`;
}

// Client-side so the current tab can be highlighted from the URL.
export function NavLinks() {
  const pathname = usePathname();
  const links: [string, string, LucideIcon][] = [
    ["/watchlist", "Watchlist", Bookmark],
    ["/stats", "Stats", ChartColumn],
    ["/recommendations", "Taste profile", Sparkles],
    ["/friends", "Friends", Users],
  ];

  return links.map(([href, label, Icon]) => (
    <Link key={href} href={href} className={`tab ${pathname.startsWith(href) ? "tab-active" : ""}`}>
      <Icon size={16} />
      {label}
    </Link>
  ));
}

// Top-right account menu: your profile, settings and sign out.
export function UserMenu({ username }: { username: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Closes on any click outside the menu.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const active = pathname.startsWith("/settings") || pathname === `/u/${username}`;
  const item = "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800";

  return (
    <div ref={ref} className="relative">
      <button className={`tab ${active ? "tab-active" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <User size={16} />
        {username ? `@${username}` : "Account"}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-44 rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-lg">
          {username && (
            <Link href={`/u/${username}`} className={item} onClick={() => setOpen(false)}>
              <User size={16} /> Your profile
            </Link>
          )}
          <Link href="/settings" className={item} onClick={() => setOpen(false)}>
            <Settings size={16} /> Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button className={item}>
              <LogOut size={16} /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Opens search over the current page: the icon in the header, or (bar) the big search bar on the home page.
export function SearchButton({ bar = false }: { bar?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {bar ? (
        <button className="input flex items-center gap-2 py-3 text-base text-zinc-400" onClick={() => setOpen(true)}>
          <Search size={18} /> Search films, directors or actors...
        </button>
      ) : (
        <button className="tab" aria-label="Search" title="Search" onClick={() => setOpen(true)}>
          <Search size={18} />
        </button>
      )}
      {open && <SearchPanel onClose={() => setOpen(false)} />}
    </>
  );
}

type SearchResults = {
  sections: {
    label: string;
    films: { id: number; title: string; posterPath: string | null; year: string; status: Status; friends: string[] }[];
  }[];
};

function SearchPanel({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  // Results remember which query they're for, so another query's results are never shown.
  const [results, setResults] = useState<{ query: string; data: SearchResults | { error: string } } | null>(null);

  const query = q.trim();
  const current = results?.query === query ? results.data : null;

  // Debounced: searches 300ms after typing stops, and drops the response to any older query.
  // Under 2 characters nothing is fetched, and the render below shows no results.
  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json();
          setResults({ query, data: res.ok ? data : { error: data.error ?? "Search failed" } });
        })
        .catch(() => !controller.signal.aborted && setResults({ query, data: { error: "Search failed. Try again." } }));
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 bg-black/60 px-4 pt-16" onClick={onClose}>
      <div
        className="mx-auto max-w-2xl space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="input"
          placeholder="Search by film, director or actor..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-[70vh] space-y-5 overflow-y-auto">
          {query.length < 2 ? null : !current ? (
            Array.from({ length: 4 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-md bg-zinc-800" />)
          ) : "error" in current ? (
            <p className="text-sm text-red-400">{current.error}</p>
          ) : current.sections.length === 0 ? (
            <p className="text-sm text-zinc-400">No films found for “{query}”.</p>
          ) : (
            current.sections.map((s) => (
              <section key={s.label}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{s.label}</h3>
                <ul className="space-y-2">
                  {s.films.map((m) => (
                    <li key={m.id} className="flex items-center gap-3">
                      <Link href={`/movie/${m.id}`} className="w-10 shrink-0" onClick={onClose}>
                        <Poster path={m.posterPath} title={m.title} size="w92" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/movie/${m.id}`} className="block truncate text-sm hover:text-amber-400" onClick={onClose}>
                          {m.title} <span className="text-zinc-500">{m.year}</span>
                        </Link>
                        {m.friends.length > 0 && (
                          <p className="truncate text-xs text-emerald-400">Watched by {m.friends.map((f) => `@${f}`).join(", ")}</p>
                        )}
                      </div>
                      <ListButtons movieId={m.id} status={m.status} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Watchlist toggle (+ / green tick) and mark watched; clicking "Watched" un-marks the film, which
// removes it from your lists along with its rating and review. Keeps its own status so it also works
// on the client-rendered taste profile page, where a refresh doesn't re-render it.
export function ListButtons({ movieId, status: initial }: { movieId: number; status: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  // A server refresh can change the status from elsewhere on the page (rating a film marks it
  // watched), so a new value from the server replaces the local one.
  const [fromServer, setFromServer] = useState(initial);
  if (initial !== fromServer) {
    setFromServer(initial);
    setStatus(initial);
  }
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "watched" ? (
          <button
            className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
            title="Watched, click to un-mark"
            disabled={busy}
            onClick={() => confirm("Un-mark as watched? It's removed from your lists, with any rating and review.") && update(null)}
          >
            <Check size={16} /> Watched
          </button>
        ) : (
          <>
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
          </>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

type Review = { rating: number; body: string | null; isPublic: boolean };

// The editable rating and review, used on the film page and in the watched list.
// onDone (which also shows a Cancel button) runs after a save or delete.
function ReviewEditor({ movieId, existing, onDone }: { movieId: number; existing: Review | null; onDone?: () => void }) {
  const router = useRouter();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(method: "PUT" | "DELETE") {
    if (method === "PUT" && rating === 0) return setError("Pick a rating from 1 to 10 before saving.");
    setBusy(true);
    const err = await callApi(method, `/api/reviews/${movieId}`, method === "PUT" ? { rating, body, isPublic } : undefined);
    setBusy(false);
    setError(err);
    if (err) return;
    router.refresh();
    onDone?.();
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit("PUT");
      }}
    >
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} out of 10`}
            aria-pressed={n === rating}
            className={`h-8 w-8 rounded text-sm ${n <= rating ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 hover:bg-zinc-700"}`}
            onClick={() => {
              setRating(n);
              setError(null);
            }}
          >
            {n}
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        Visible to your followers
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" disabled={busy}>
          Save
        </button>
        {onDone && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={onDone}>
            Cancel
          </button>
        )}
        {existing && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => submit("DELETE")}>
            Delete rating
          </button>
        )}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </form>
  );
}

// Film page: your rating and review, read-only until the pen is clicked.
export function ReviewCard({ movieId, existing }: { movieId: number; existing: Review | null }) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{existing ? "Your review" : "Rate this film"}</h2>
        {existing && !editing && (
          <button className="text-zinc-400 hover:text-zinc-100" aria-label="Edit review" title="Edit" onClick={() => setEditing(true)}>
            <Pencil size={18} />
          </button>
        )}
      </div>
      {editing || !existing ? (
        <ReviewEditor movieId={movieId} existing={existing} onDone={existing ? () => setEditing(false) : undefined} />
      ) : (
        <>
          <p className="flex items-center gap-2">
            <Rating rating={existing.rating} />
            {!existing.isPublic && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">Private</span>}
          </p>
          {existing.body && <p className="whitespace-pre-line text-sm text-zinc-300">{existing.body}</p>}
        </>
      )}
    </section>
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

// One row of the watched section: rating on the right, the review's first two sentences (… shows
// the rest), the pen to edit both, and the bin to remove the film with its rating and review.
export function WatchedEntry({ film }: { film: WatchedFilm }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function remove() {
    if (!confirm(`Remove ${film.title}? Its rating and review will be deleted too.`)) return;
    setBusy(true);
    const err = await callApi("DELETE", `/api/watchlist/${film.movieId}`);
    setBusy(false);
    if (err) alert(err);
    else startRefresh(() => router.refresh());
  }

  const sentences = film.body?.split(/(?<=[.!?])\s+/) ?? [];

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
          <div className="flex shrink-0 items-center gap-3">
            {film.rating ? <Rating rating={film.rating} /> : <span className="text-xs text-zinc-500">Not rated</span>}
            <button
              className="text-zinc-400 hover:text-zinc-100"
              aria-label="Edit rating and review"
              title="Edit rating and review"
              onClick={() => setEditing(!editing)}
            >
              <Pencil size={18} />
            </button>
            <button
              className="text-zinc-400 hover:text-red-400 disabled:opacity-50"
              aria-label="Remove film"
              title="Remove film, with its rating and review"
              disabled={busy || refreshing}
              onClick={remove}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {editing ? (
          <ReviewEditor
            movieId={film.movieId}
            existing={film.rating ? { rating: film.rating, body: film.body, isPublic: film.isPublic ?? true } : null}
            onDone={() => setEditing(false)}
          />
        ) : (
          film.body && (
            <p className="whitespace-pre-line text-sm text-zinc-300">
              {expanded ? film.body : sentences.slice(0, 2).join(" ")}
              {sentences.length > 2 && (
                <button className="ml-1 text-amber-400" onClick={() => setExpanded(!expanded)}>
                  {expanded ? "less" : "…"}
                </button>
              )}
            </p>
          )
        )}
      </div>
    </li>
  );
}

// Follow, or (for a private account) send a request. Clicking again unfollows or cancels the request.
// These buttons stay disabled until the refreshed page arrives, so a second click always acts on the
// current status rather than the one before the first click.
export function FollowButton({ username, status }: { username: string; status: FollowStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function toggle() {
    setBusy(true);
    const err = await callApi(status ? "DELETE" : "PUT", `/api/follows/${username}`);
    setBusy(false);
    if (err) alert(err);
    else startRefresh(() => router.refresh());
  }

  return (
    <button
      className={status ? "btn-ghost" : "btn"}
      title={status === "requested" ? "Click to cancel the request" : undefined}
      disabled={busy || refreshing}
      onClick={toggle}
    >
      {status === "following" ? "Following" : status === "requested" ? "Requested" : "Follow"}
    </button>
  );
}

// Accept or decline someone's request to follow your private account.
export function RequestButtons({ username }: { username: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function answer(method: "PUT" | "DELETE") {
    setBusy(true);
    const err = await callApi(method, `/api/followers/${username}`);
    setBusy(false);
    if (err) alert(err);
    else startRefresh(() => router.refresh());
  }

  return (
    <div className="flex shrink-0 gap-2">
      <button className="btn" disabled={busy || refreshing} onClick={() => answer("PUT")}>
        Accept
      </button>
      <button className="btn-ghost" disabled={busy || refreshing} onClick={() => answer("DELETE")}>
        Decline
      </button>
    </div>
  );
}

// Handle and display name. Onboarding (no initial values) goes home after saving; settings stays put.
export function ProfileForm({ initial }: { initial?: { username: string; displayName: string | null } }) {
  const router = useRouter();
  const [username, setUsername] = useState(initial?.username ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await callApi("PATCH", "/api/profile", { username, displayName });
        setBusy(false);
        setMessage(err ? { text: err, error: true } : initial ? { text: "Saved", error: false } : null);
        if (err) return;
        if (!initial) router.push("/");
        router.refresh();
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
      {message && <p className={`text-sm ${message.error ? "text-red-400" : "text-zinc-300"}`}>{message.text}</p>}
      <button className="btn" disabled={busy}>
        {initial ? "Save" : "Continue"}
      </button>
    </form>
  );
}
