import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { follows, genres, movieGenres, movies, profiles, reviews, tasteProfiles, watchlist } from "@/db/schema";
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

// Used by /settings, /friends and the taste profile: the user's own settings.
export async function getSettings(userId: string) {
  const [settings] = await db
    .select({
      displayName: profiles.displayName,
      isPrivate: profiles.isPrivate,
      tasteUsesWatched: profiles.tasteUsesWatched,
      tasteUsesWatchlist: profiles.tasteUsesWatchlist,
    })
    .from(profiles)
    .where(eq(profiles.id, userId));
  return settings;
}

// Used by /watchlist: the user's films with their own rating, latest added or watched first.
export function getList(userId: string) {
  return db
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
    .leftJoin(reviews, reviewOf(false))
    .where(eq(watchlist.userId, userId))
    .orderBy(desc(sql`coalesce(${watchlist.watchedAt}, ${watchlist.addedAt})`));
}

// Used by the movie page: the user's own status and review for one film, or null if it isn't on their list.
export async function getMyFilm(userId: string, movieId: number) {
  const [film] = await db
    .select({ watchedAt: watchlist.watchedAt, rating: reviews.rating, body: reviews.body, isPublic: reviews.isPublic })
    .from(watchlist)
    .leftJoin(reviews, reviewOf(false))
    .where(and(eq(watchlist.userId, userId), eq(watchlist.movieId, movieId)));
  return film ?? null;
}

// Used by the taste profile: films on the user's "to watch" list, newest first.
export function getToWatch(userId: string) {
  return db
    .select({ movieId: movies.id, title: movies.title })
    .from(watchlist)
    .innerJoin(movies, eq(movies.id, watchlist.movieId))
    .where(and(eq(watchlist.userId, userId), isNull(watchlist.watchedAt)))
    .orderBy(desc(watchlist.addedAt))
    .limit(40);
}

// Used by getCandidates and the taste profile: the id of every film on the user's list.
export async function getListIds(userId: string) {
  const rows = await db.select({ movieId: watchlist.movieId }).from(watchlist).where(eq(watchlist.userId, userId));
  return rows.map((r) => r.movieId);
}

// Used by /friends: the people the user follows, and the requests waiting for them to answer.
export function getFollowing(userId: string) {
  return db
    .select({ username: profiles.username, displayName: profiles.displayName })
    .from(follows)
    .innerJoin(profiles, eq(profiles.id, follows.followeeId))
    .where(and(eq(follows.followerId, userId), eq(follows.accepted, true)))
    .orderBy(profiles.username);
}

export function getFollowRequests(userId: string) {
  return db
    .select({ username: profiles.username, displayName: profiles.displayName })
    .from(follows)
    .innerJoin(profiles, eq(profiles.id, follows.followerId))
    .where(and(eq(follows.followeeId, userId), eq(follows.accepted, false)))
    .orderBy(follows.createdAt);
}

// Used by the taste profile: the user's saved profile, or null.
export async function getSavedTasteProfile(userId: string) {
  const [saved] = await db.select().from(tasteProfiles).where(eq(tasteProfiles.userId, userId));
  return saved ?? null;
}

export async function saveTasteProfile(userId: string, values: Omit<typeof tasteProfiles.$inferInsert, "userId">) {
  const [saved] = await db
    .insert(tasteProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: tasteProfiles.userId, set: values })
    .returning();
  return saved;
}

// The taste profile's daily limit. Days follow the database clock (UTC on Supabase).
const usedToday = sql<number>`case when ${profiles.tasteGenerationsOn} = current_date then ${profiles.tasteGenerations} else 0 end`;

export async function getTasteGenerationsToday(userId: string) {
  const [row] = await db.select({ used: usedToday.mapWith(Number) }).from(profiles).where(eq(profiles.id, userId));
  return row?.used ?? 0;
}

// Takes one of today's generations, returning how many are now used, or null if none were left.
// It's one UPDATE, so two requests at once can't both take the last one.
export async function takeTasteGeneration(userId: string, limit: number) {
  const [row] = await db
    .update(profiles)
    .set({ tasteGenerations: sql`${usedToday} + 1`, tasteGenerationsOn: sql`current_date` })
    .where(and(eq(profiles.id, userId), lt(usedToday, limit)))
    .returning({ used: profiles.tasteGenerations });
  return row?.used ?? null;
}

// Gives back a generation that didn't produce a profile (every Gemini model failed).
export async function returnTasteGeneration(userId: string) {
  await db
    .update(profiles)
    .set({ tasteGenerations: sql`greatest(${profiles.tasteGenerations} - 1, 0)` })
    .where(and(eq(profiles.id, userId), eq(profiles.tasteGenerationsOn, sql`current_date`)));
}

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

// Used by /friends, GET /api/feed and the movie page (with movieId): films the people you follow
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

// Used by /friends and GET /api/users?q=: find members by handle or display name.
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

// Cache tag for a user's home page row. Changing their list or ratings clears it.
export const homeTag = (userId: string) => `home:${userId}`;

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
  const [onList, results] = await Promise.all([
    getListIds(userId),
    Promise.all(seedIds.map((id) => tmdb<{ results: TmdbMovie[] }>(`/movie/${id}/recommendations`))),
  ]);
  const exclude = new Set(onList);
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
