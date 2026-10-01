import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { follows, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getFeed, searchUsers } from "@/lib/queries";
import { FollowButton, RequestButtons } from "@/components/actions";
import { Poster, Rating } from "@/components/ui";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  // People you follow, and requests to follow you (only a private account gets those).
  const [feed, following, requests, found, [me]] = await Promise.all([
    getFeed(user.id),
    db
      .select({ username: profiles.username, displayName: profiles.displayName })
      .from(follows)
      .innerJoin(profiles, eq(profiles.id, follows.followeeId))
      .where(and(eq(follows.followerId, user.id), eq(follows.accepted, true)))
      .orderBy(profiles.username),
    db
      .select({ username: profiles.username, displayName: profiles.displayName })
      .from(follows)
      .innerJoin(profiles, eq(profiles.id, follows.followerId))
      .where(and(eq(follows.followeeId, user.id), eq(follows.accepted, false)))
      .orderBy(follows.createdAt),
    q.length >= 2 ? searchUsers(q, user.id) : null,
    db.select({ isPrivate: profiles.isPrivate }).from(profiles).where(eq(profiles.id, user.id)),
  ]);
  const showRequests = me.isPrivate && params.tab === "requests";

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_18rem]">
      <section className="min-w-0">
        <h1 className="mb-6 text-2xl font-bold">Recent activity</h1>
        {feed.length === 0 ? (
          <p className="text-zinc-400">Nothing yet. Follow people to see what they watch.</p>
        ) : (
          <ul className="space-y-4">
            {feed.map((item) => (
              <li key={`${item.username}-${item.movieId}`} className="flex gap-4 rounded-lg border border-zinc-800 p-4">
                <Link href={`/movie/${item.movieId}`} className="w-16 shrink-0">
                  <Poster path={item.posterPath} title={item.title} size="w154" />
                </Link>
                <div className="min-w-0">
                  <p className="text-sm">
                    <Link href={`/u/${item.username}`} className="font-semibold hover:text-amber-400">
                      {item.displayName ?? `@${item.username}`}
                    </Link>{" "}
                    {item.rating ? "rated" : "watched"}{" "}
                    <Link href={`/movie/${item.movieId}`} className="font-semibold hover:text-amber-400">{item.title}</Link>
                  </p>
                  {item.rating && <Rating rating={item.rating} />}
                  {item.body && <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">{item.body}</p>}
                  <p className="mt-2 text-xs text-zinc-500">{item.at?.toLocaleDateString()}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-8">
        <section>
          <h2 className="mb-3 font-semibold">Find people</h2>
          <form action="/activity">
            <input name="q" defaultValue={q} minLength={2} className="input" placeholder="Handle or name..." />
          </form>
          {found && (
            <ul className="mt-3 space-y-2">
              {found.length === 0 && <li className="text-sm text-zinc-400">No one found for “{q}”.</li>}
              {found.map((u) => (
                <li key={u.username} className="flex items-center justify-between gap-2">
                  <UserLink username={u.username!} displayName={u.displayName} />
                  <FollowButton username={u.username!} status={u.followStatus} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex gap-2 text-sm font-semibold">
            <Link href="/activity" className={`tab ${showRequests ? "" : "tab-active"}`}>
              Following ({following.length})
            </Link>
            {me.isPrivate && (
              <Link href="/activity?tab=requests" className={`tab ${showRequests ? "tab-active" : ""}`}>
                Requests ({requests.length})
              </Link>
            )}
          </div>
          {showRequests ? (
            requests.length === 0 ? (
              <p className="text-sm text-zinc-400">No follow requests.</p>
            ) : (
              <ul className="space-y-2">
                {requests.map((u) => (
                  <li key={u.username} className="flex items-center justify-between gap-2">
                    <UserLink username={u.username!} displayName={u.displayName} />
                    <RequestButtons username={u.username!} />
                  </li>
                ))}
              </ul>
            )
          ) : following.length === 0 ? (
            <p className="text-sm text-zinc-400">You're not following anyone yet.</p>
          ) : (
            <ul className="space-y-2">
              {following.map((u) => (
                <li key={u.username}>
                  <UserLink username={u.username!} displayName={u.displayName} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function UserLink({ username, displayName }: { username: string; displayName: string | null }) {
  return (
    <Link href={`/u/${username}`} className="min-w-0 text-sm hover:text-amber-400">
      <span className="font-semibold">{displayName ?? `@${username}`}</span>
      {displayName && <span className="ml-1 text-zinc-500">@{username}</span>}
    </Link>
  );
}
