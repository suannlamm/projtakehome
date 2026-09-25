import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { follows, genres, movieGenres, movies, profiles, reviews, watchlist } from "@/db/schema";

// Used by the profile page and GET /api/users/:username.
// Never returns user ids. Other viewers only see (and get stats from) public reviews.
export async function getProfile(username: string, viewerId: string) {
  const [profile] = await db
    .select({ id: profiles.id, username: profiles.username })
    .from(profiles)
    .where(eq(profiles.username, username.toLowerCase()));
  if (!profile) return null;

  const isOwner = profile.id === viewerId;
  const visible = isOwner
    ? eq(reviews.userId, profile.id)
    : and(eq(reviews.userId, profile.id), eq(reviews.isPublic, true));

  const [reviewRows, watchlistRows, [summary], topGenres, [social]] = await Promise.all([
    db
      .select({
        movieId: movies.id,
        title: movies.title,
        posterPath: movies.posterPath,
        rating: reviews.rating,
        body: reviews.body,
        isPublic: reviews.isPublic,
        watchedOn: reviews.watchedOn,
        updatedAt: reviews.updatedAt,
      })
      .from(reviews)
      .innerJoin(movies, eq(movies.id, reviews.movieId))
      .where(visible)
      .orderBy(desc(reviews.updatedAt)),

    db
      .select({ movieId: movies.id, title: movies.title, posterPath: movies.posterPath, addedAt: watchlist.addedAt })
      .from(watchlist)
      .innerJoin(movies, eq(movies.id, watchlist.movieId))
      .where(eq(watchlist.userId, profile.id))
      .orderBy(desc(watchlist.addedAt)),

    db
      .select({
        rated: sql<number>`count(*)`.mapWith(Number),
        average: sql<number | null>`round(avg(${reviews.rating}), 2)`.mapWith((v) => (v === null ? null : Number(v))),
        stars1: sql<number>`count(*) filter (where ${reviews.rating} = 1)`.mapWith(Number),
        stars2: sql<number>`count(*) filter (where ${reviews.rating} = 2)`.mapWith(Number),
        stars3: sql<number>`count(*) filter (where ${reviews.rating} = 3)`.mapWith(Number),
        stars4: sql<number>`count(*) filter (where ${reviews.rating} = 4)`.mapWith(Number),
        stars5: sql<number>`count(*) filter (where ${reviews.rating} = 5)`.mapWith(Number),
      })
      .from(reviews)
      .where(visible),

    db
      .select({ genre: genres.name, count: sql<number>`count(*)`.mapWith(Number) })
      .from(reviews)
      .innerJoin(movieGenres, eq(movieGenres.movieId, reviews.movieId))
      .innerJoin(genres, eq(genres.id, movieGenres.genreId))
      .where(visible)
      .groupBy(genres.name)
      .orderBy(desc(sql`count(*)`))
      .limit(5),

    db
      .select({
        followers: sql<number>`count(*) filter (where ${follows.followeeId} = ${profile.id})`.mapWith(Number),
        following: sql<number>`count(*) filter (where ${follows.followerId} = ${profile.id})`.mapWith(Number),
        isFollowing: sql<boolean>`coalesce(bool_or(${follows.followerId} = ${viewerId} and ${follows.followeeId} = ${profile.id}), false)`,
      })
      .from(follows),
  ]);

  const { rated, average, ...stars } = summary;
  return {
    username: profile.username!,
    isOwner,
    ...social,
    stats: {
      rated,
      average,
      distribution: [stars.stars1, stars.stars2, stars.stars3, stars.stars4, stars.stars5],
      topGenres,
      watchlistSize: watchlistRows.length,
    },
    reviews: reviewRows,
    watchlist: watchlistRows,
  };
}

// Used by the home page and GET /api/feed: latest public reviews from people the viewer follows.
export async function getFeed(viewerId: string) {
  return db
    .select({
      username: profiles.username,
      movieId: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      rating: reviews.rating,
      body: reviews.body,
      updatedAt: reviews.updatedAt,
    })
    .from(reviews)
    .innerJoin(follows, and(eq(follows.followeeId, reviews.userId), eq(follows.followerId, viewerId)))
    .innerJoin(profiles, eq(profiles.id, reviews.userId))
    .innerJoin(movies, eq(movies.id, reviews.movieId))
    .where(eq(reviews.isPublic, true))
    .orderBy(desc(reviews.updatedAt))
    .limit(30);
}
