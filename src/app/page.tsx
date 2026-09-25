import Link from "next/link";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { getFeed } from "@/lib/queries";
import { Poster, Stars } from "@/components/ui";

export default async function HomePage() {
  if (!(await getCurrentUser())) {
    return (
      <section className="py-20 text-center">
        <h1 className="text-4xl font-bold">Keep track of every film you watch.</h1>
        <p className="mt-3 text-zinc-400">Build a watchlist, rate and review films, follow friends, and get AI picks based on your taste.</p>
        <Link href="/login" className="btn mt-8 inline-block">Get started</Link>
      </section>
    );
  }

  const user = await requireUser();
  const feed = await getFeed(user.id);

  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold">From people you follow</h1>
      {feed.length === 0 ? (
        <p className="text-zinc-400">
          Nothing here yet. <Link href="/search" className="text-amber-400">Find a film</Link> to review, or follow someone from
          their profile.
        </p>
      ) : (
        <ul className="space-y-4">
          {feed.map((item) => (
            <li key={`${item.username}-${item.movieId}`} className="flex gap-4 rounded-lg border border-zinc-800 p-4">
              <Link href={`/movie/${item.movieId}`} className="w-16 shrink-0">
                <Poster path={item.posterPath} title={item.title} size="w154" />
              </Link>
              <div className="min-w-0">
                <p className="text-sm">
                  <Link href={`/u/${item.username}`} className="font-semibold hover:text-amber-400">@{item.username}</Link>{" "}
                  rated <Link href={`/movie/${item.movieId}`} className="font-semibold hover:text-amber-400">{item.title}</Link>
                </p>
                <Stars rating={item.rating} />
                {item.body && <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">{item.body}</p>}
                <p className="mt-2 text-xs text-zinc-500">{item.updatedAt.toLocaleDateString()}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
