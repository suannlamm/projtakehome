import { and, count, desc, eq, ilike, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { follows, genres, movieGenres, movies, profiles, reviews, watchlist } from "@/db/schema";
import { tmdb, type TmdbMovie } from "@/lib/tmdb";

// None of these return user ids: people are identified by username only.

// Joins a watchlist row to its review. Other people only ever see public reviews.
const reviewOf = (publicOnly: boolean) =>
  and(
    eq(reviews.userId, watchlist.userId),
    eq(reviews.movieId, watchlist.movieId),
    publicOnly ? eq(reviews.isPublic, true) : undefined,
  );

// Only an accepted follow counts. A pending one is a request to a private account.
const followsAccepted = (viewerId: string) =>
  and(eq(follows.followerId, viewerId), eq(follows.followeeId, watchlist.userId), eq(follows.accepted, true));

export type FollowStatus = "following" | "requested" | null;

const followStatus = (viewerId: string) =>
  sql<FollowStatus>`(select case when ${follows.accepted} then 'following' else 'requested' end
    from ${follows} where ${follows.followerId} = ${viewerId} and ${follows.followeeId} = ${profiles.id})`;

// Used by /stats and member profiles.
export async function getStats(userId: string, includePrivate: boolean) {
  const watched = and(eq(watchlist.userId, userId), isNotNull(watchlist.watchedAt));
  const [[summary], genreCounts] = await Promise.all([
    db
      .select({
        watched: count(),
        rated: count(reviews.rating),
        average: sql<number | null>`round(avg(${reviews.rating}), 1)`.mapWith((v) => (v === null ? null : Number(v))),
      })
      .from(watchlist)
      .leftJoin(reviews, reviewOf(!includePrivate))
      .where(watched),
    db
      .select({ genre: genres.name, count: count() })
      .from(watchlist)
      .innerJoin(movieGenres, eq(movieGenres.movieId, watchlist.movieId))
      .innerJoin(genres, eq(genres.id, movieGenres.genreId))
      .where(watched)
      .groupBy(genres.name)
      .orderBy(desc(count()), genres.name),
  ]);
  return { ...summary, genres: genreCounts };
}

// Used by the profile page and GET /api/users/:username.
// Anyone can see a member's handle and follow counts; their films and stats need an accepted follow.
export async function getProfile(username: string, viewerId: string) {
  const [profile] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      isPrivate: profiles.isPrivate,
      followers: sql<number>`(select count(*) from ${follows} where ${follows.followeeId} = ${profiles.id} and ${follows.accepted})`.mapWith(Number),
      following: sql<number>`(select count(*) from ${follows} where ${follows.followerId} = ${profiles.id} and ${follows.accepted})`.mapWith(Number),
      followStatus: followStatus(viewerId),
    })
    .from(profiles)
    .where(eq(profiles.username, username.toLowerCase()));
  if (!profile) return null;

  const { id, ...header } = profile;
  const member = { ...header, username: header.username!, isOwner: id === viewerId };
  if (!member.isOwner && member.followStatus !== "following") return { ...member, canView: false as const };

  const [stats, watched] = await Promise.all([
    getStats(id, member.isOwner),
    db
      .select({
        movieId: movies.id,
        title: movies.title,
        posterPath: movies.posterPath,
        watchedAt: watchlist.watchedAt,
        rating: reviews.rating,
        body: reviews.body,
        isPublic: reviews.isPublic,
      })
      .from(watchlist)
      .innerJoin(movies, eq(movies.id, watchlist.movieId))
      .leftJoin(reviews, reviewOf(!member.isOwner))
      .where(and(eq(watchlist.userId, id), isNotNull(watchlist.watchedAt)))
      .orderBy(desc(watchlist.watchedAt)),
  ]);
  return { ...member, canView: true as const, stats, watched };
}

// Used by /activity, GET /api/feed and the movie page (with movieId): films the people you follow
// have watched, with their rating if it's public. A later rating bumps the event back up.
export async function getFeed(viewerId: string, movieId?: number) {
  const at = sql`greatest(${watchlist.watchedAt}, ${reviews.updatedAt})`;
  return db
    .select({
      username: profiles.username,
      displayName: profiles.displayName,
      movieId: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      rating: reviews.rating,
      body: reviews.body,
      at: at.mapWith(watchlist.watchedAt),
    })
    .from(watchlist)
    .innerJoin(follows, followsAccepted(viewerId))
    .innerJoin(profiles, eq(profiles.id, watchlist.userId))
    .innerJoin(movies, eq(movies.id, watchlist.movieId))
    .leftJoin(reviews, reviewOf(true))
    .where(and(isNotNull(watchlist.watchedAt), movieId === undefined ? undefined : eq(watchlist.movieId, movieId)))
    .orderBy(desc(at))
    .limit(30);
}

// Used by /activity and GET /api/users?q=: find members by handle or display name.
export async function searchUsers(q: string, viewerId: string) {
  const pattern = `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;
  return db
    .select({ username: profiles.username, displayName: profiles.displayName, followStatus: followStatus(viewerId) })
    .from(profiles)
    .where(
      and(
        ne(profiles.id, viewerId),
        isNotNull(profiles.username),
        or(ilike(profiles.username, pattern), ilike(profiles.displayName, pattern)),
      ),
    )
    .orderBy(profiles.username)
    .limit(20);
}

// Used by the home page and the taste profile: the user's watched films, best rated first.
export async function getWatchedHistory(userId: string) {
  return db
    .select({ movieId: movies.id, title: movies.title, rating: reviews.rating, body: reviews.body })
    .from(watchlist)
    .innerJoin(movies, eq(movies.id, watchlist.movieId))
    .leftJoin(reviews, reviewOf(false))
    .where(and(eq(watchlist.userId, userId), isNotNull(watchlist.watchedAt)))
    .orderBy(sql`${reviews.rating} desc nulls last`, desc(watchlist.watchedAt));
}

// Used by the home page and the taste profile: TMDB's recommendations for the seed films,
// minus anything already on the user's list. Films suggested by several seeds rank first.
export async function getCandidates(userId: string, seedIds: number[]) {
  const [mine, results] = await Promise.all([
    db.select({ movieId: watchlist.movieId }).from(watchlist).where(eq(watchlist.userId, userId)),
    Promise.all(seedIds.map((id) => tmdb<{ results: TmdbMovie[] }>(`/movie/${id}/recommendations`))),
  ]);
  const exclude = new Set(mine.map((m) => m.movieId));
  const candidates = new Map<number, { movie: TmdbMovie; hits: number }>();
  for (const movie of results.flatMap((r) => r?.results ?? [])) {
    if (exclude.has(movie.id)) continue;
    const entry = candidates.get(movie.id) ?? { movie, hits: 0 };
    entry.hits++;
    candidates.set(movie.id, entry);
  }
  return [...candidates.values()]
    .sort((a, b) => b.hits - a.hits || b.movie.vote_average - a.movie.vote_average)
    .map((e) => e.movie);
}

export type Status = "to_watch" | "watched" | null;

// Used by poster grids (search, home): the viewer's own status for each film, and which of the
// people they follow have watched it.
export async function getPosterInfo(viewerId: string, movieIds: number[]) {
  const info = new Map<number, { status: Status; friends: string[] }>();
  if (movieIds.length === 0) return info;

  const rows = await db
    .select({
      movieId: watchlist.movieId,
      username: profiles.username,
      mine: sql<boolean>`${watchlist.userId} = ${viewerId}`,
      watched: isNotNull(watchlist.watchedAt).mapWith(Boolean),
    })
    .from(watchlist)
    .innerJoin(profiles, eq(profiles.id, watchlist.userId))
    .leftJoin(follows, followsAccepted(viewerId))
    .where(
      and(
        inArray(watchlist.movieId, movieIds),
        or(eq(watchlist.userId, viewerId), and(isNotNull(follows.followerId), isNotNull(watchlist.watchedAt))),
      ),
    );

  for (const row of rows) {
    const entry = info.get(row.movieId) ?? { status: null, friends: [] };
    if (row.mine) entry.status = row.watched ? "watched" : "to_watch";
    else entry.friends.push(row.username!);
    info.set(row.movieId, entry);
  }
  return info;
}
