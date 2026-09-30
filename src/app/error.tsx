"use client";

// Shown when a page throws, e.g. TMDB is down or rate-limiting us.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-zinc-400">A service we depend on (like TMDB) may be unavailable. Try again in a moment.</p>
      <button className="btn mt-6" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
