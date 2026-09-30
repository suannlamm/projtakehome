import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// One row per Supabase auth user, created by the on_auth_user_created trigger.
// username (the public handle) stays null until the user picks one on /onboarding.
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
    username: text("username").unique(),
    displayName: text("display_name"),
    createdAt: createdAt(),
  },
  (t) => [check("profiles_username_format", sql`${t.username} ~ '^[a-z0-9_]{3,20}$'`)],
);

// Local copy of the TMDB movies users have interacted with; id is the TMDB id.
export const movies = pgTable("movies", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  posterPath: text("poster_path"),
  releaseDate: date("release_date"),
  overview: text("overview"),
});

// TMDB genre ids are stable, so they're used as the primary key.
export const genres = pgTable("genres", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const movieGenres = pgTable(
  "movie_genres",
  {
    movieId: integer("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
    genreId: integer("genre_id").notNull().references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.movieId, t.genreId] })],
);

// A user's films: "to watch" while watched_at is null, "watched" once it's set.
export const watchlist = pgTable(
  "watchlist",
  {
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    movieId: integer("movie_id").notNull().references(() => movies.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    watchedAt: timestamp("watched_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.movieId] }), index("watchlist_movie_id_idx").on(t.movieId)],
);

// A rating (and optional review) of a watched film. The foreign key onto watchlist means a review
// can't exist without its watchlist row, and removing the film from the list removes the review.
export const reviews = pgTable(
  "reviews",
  {
    userId: uuid("user_id").notNull(),
    movieId: integer("movie_id").notNull(),
    rating: smallint("rating").notNull(),
    body: text("body"),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.movieId] }),
    foreignKey({ columns: [t.userId, t.movieId], foreignColumns: [watchlist.userId, watchlist.movieId] }).onDelete(
      "cascade",
    ),
    check("reviews_rating_range", sql`${t.rating} between 1 and 10`),
  ],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    check("follows_no_self_follow", sql`${t.followerId} <> ${t.followeeId}`),
    index("follows_followee_id_idx").on(t.followeeId),
  ],
);
