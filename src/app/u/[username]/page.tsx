import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { FollowButton } from "@/components/actions";
import { Poster, Rating, StatsPanel } from "@/components/ui";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const user = await requireUser();
  const profile = await getProfile((await params).username, user.id);
  if (!profile) notFound();

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            {profile.displayName ?? `@${profile.username}`}
            {profile.isPrivate && <Lock size={20} className="text-zinc-500" aria-label="Private account" />}
          </h1>
          {profile.displayName && <p className="text-zinc-400">@{profile.username}</p>}
        </div>
        <p className="text-sm text-zinc-400">
          {profile.followers} followers · {profile.following} following
        </p>
        {!profile.isOwner && <FollowButton username={profile.username} status={profile.followStatus} />}
      </header>

      {!profile.canView ? (
        <p className="text-zinc-400">
          {profile.followStatus === "requested"
            ? `Request sent. You'll see what @${profile.username} has watched once they accept.`
            : profile.isPrivate
              ? `This account is private. Send @${profile.username} a follow request to see what they've watched.`
              : `Follow @${profile.username} to see what they've watched.`}
        </p>
      ) : (
        <>
          <StatsPanel stats={profile.stats} />

          <section>
            <h2 className="mb-3 text-lg font-semibold">Watched</h2>
            {profile.watched.length === 0 ? (
              <p className="text-sm text-zinc-400">Nothing watched yet.</p>
            ) : (
              <ul className="space-y-3">
                {profile.watched.map((w) => (
                  <li key={w.movieId} className="flex gap-4 rounded-lg border border-zinc-800 p-4">
                    <Link href={`/movie/${w.movieId}`} className="w-14 shrink-0">
                      <Poster path={w.posterPath} title={w.title} size="w154" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <Link href={`/movie/${w.movieId}`} className="font-semibold hover:text-amber-400">{w.title}</Link>{" "}
                        {w.rating && <Rating rating={w.rating} />}
                        {w.isPublic === false && (
                          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">Private</span>
                        )}
                      </p>
                      {w.body && <p className="mt-1 whitespace-pre-line text-sm text-zinc-300">{w.body}</p>}
                      <p className="mt-1 text-xs text-zinc-500">Watched {w.watchedAt?.toLocaleDateString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
