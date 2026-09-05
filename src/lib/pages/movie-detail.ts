import { hydrateMovie } from "@/lib/movies/metadata";
import { mapWatchRecordsToStateEntries } from "@/lib/movies/records";

import { mapRatingRecordsToStateEntries } from "@/lib/ratings/records";
import { shouldUseProcessLocalMutableCache } from "@/lib/runtime-cache-policy";
import { readTimedCache, TimedCache, writeTimedCacheWithTtl, MOVIE_DETAIL_CACHE_TTL_MS } from "@/lib/state-cache";
import type { createStateReader } from "@/lib/state-readers";
import { AppState, Movie, User, UserRating, WatchEntry } from "@/lib/types";
import { average } from "@/lib/utils";

type Dependencies = {
  shouldAttemptDatabaseRead: () => boolean;
  loadMovieBySlugFromDatabase: (slug: string) => Promise<Movie | null>;
  hydrateMoviesForDatabaseRead: (movies: Movie[]) => Promise<void>;
  loadUsersForRead: (options?: { includeAvatarUrls?: boolean }) => Promise<User[]>;
  markDatabaseReadHealthy: () => void;
  markDatabaseReadFailure: (scope: string, error: unknown) => void;
  shouldUseDatabase: () => boolean;
  loadAppState: () => Promise<AppState>;
  getMovieBySlug: ReturnType<typeof createStateReader>["getMovieBySlug"];
  getRatingsForMovieFromState: ReturnType<typeof createStateReader>["getRatingsForMovieFromState"];
  getWatchEntryForMovieFromState: ReturnType<typeof createStateReader>["getWatchEntryForMovieFromState"];
  listMembersFromState: ReturnType<typeof createStateReader>["listMembersFromState"];
  getMovieAverageFromState: ReturnType<typeof createStateReader>["getMovieAverageFromState"];
  getStateIndexes: ReturnType<typeof createStateReader>["getStateIndexes"];
};

export function createMovieDetailPageReader({
  shouldAttemptDatabaseRead,
  loadMovieBySlugFromDatabase,
  hydrateMoviesForDatabaseRead,
  loadUsersForRead,
  markDatabaseReadHealthy,
  markDatabaseReadFailure,
  shouldUseDatabase,
  loadAppState,
  getMovieBySlug,
  getRatingsForMovieFromState,
  getWatchEntryForMovieFromState,
  listMembersFromState,
  getMovieAverageFromState,
  getStateIndexes
}: Dependencies) {
  type MovieDetailCacheKey = string;

  const movieDetailDataMemoryCache = new Map<MovieDetailCacheKey, TimedCache<{
    movie: Movie;
    watchEntry: WatchEntry | null;
    ratings: UserRating[];
    members: User[];
    average: number;
    myRating: UserRating | null;
  } | null>>();

  async function getMovieDetailDataFromDatabase(slug: string, currentUserId?: string) {
    if (!shouldAttemptDatabaseRead()) {
      return null;
    }

    try {
      const { prisma } = await import("@/lib/prisma");
      const movie = await loadMovieBySlugFromDatabase(slug);
      if (!movie) {
        return null;
      }

      await hydrateMoviesForDatabaseRead([movie]);
      const [watchRecord, ratingRows, members] = await Promise.all([
        prisma.watchEntryRecord.findUnique({
          where: { movieId: movie.id }
        }),
        prisma.ratingRecord.findMany({
          where: { movieId: movie.id },
          orderBy: [{ score: "desc" }, { updatedAt: "desc" }]
        }),
        loadUsersForRead()
      ]);
      const ratings = mapRatingRecordsToStateEntries(ratingRows);
      const detailData = {
        movie,
        watchEntry: watchRecord ? mapWatchRecordsToStateEntries([watchRecord])[0] ?? null : null,
        ratings,
        members,
        average: average(ratings.map((rating) => rating.score)),
        myRating: currentUserId ? ratings.find((rating) => rating.userId === currentUserId) ?? null : null
      };
      markDatabaseReadHealthy();
      return detailData;
    } catch (error) {
      markDatabaseReadFailure("movie detail read", error);
      return null;
    }
  }

  async function getMovieDetailDataHydrated(slug: string, currentUserId?: string) {
    const cacheKey = `${slug}:${currentUserId ?? "anon"}`;
    const usesDatabase = shouldUseDatabase();
    const shouldUseMemoryCache = shouldUseProcessLocalMutableCache(usesDatabase);

    if (usesDatabase) {
      const databaseDetail = await getMovieDetailDataFromDatabase(slug, currentUserId);
      if (databaseDetail) {
        return databaseDetail;
      }
    }

    if (shouldUseMemoryCache) {
      const cached = readTimedCache(movieDetailDataMemoryCache.get(cacheKey));
      if (cached !== null) {
        return cached;
      }
    }

    const state = await loadAppState();
    const movie = getMovieBySlug(state, slug);
    if (!movie) {
      if (shouldUseMemoryCache) {
        movieDetailDataMemoryCache.set(cacheKey, writeTimedCacheWithTtl(null, MOVIE_DETAIL_CACHE_TTL_MS));
      }
      return null;
    }

    await hydrateMovie(state, movie);

    const ratings = getRatingsForMovieFromState(state, movie.id);
    const detailData = {
      movie,
      watchEntry: getWatchEntryForMovieFromState(state, movie.id),
      ratings,
      members: listMembersFromState(state),
      average: getMovieAverageFromState(state, movie.id),
      myRating: currentUserId ? getStateIndexes(state).ratingByUserMovie.get(`${currentUserId}:${movie.id}`) ?? null : null
    };
    if (shouldUseMemoryCache) {
      movieDetailDataMemoryCache.set(cacheKey, writeTimedCacheWithTtl(detailData, MOVIE_DETAIL_CACHE_TTL_MS));
    }
    return detailData;
  }

  async function getWatchEntryForMovie(movieId: string) {
    const state = await loadAppState();
    return getWatchEntryForMovieFromState(state, movieId);
  }

  async function getRatingsForMovie(movieId: string) {
    const state = await loadAppState();
    return getRatingsForMovieFromState(state, movieId);
  }

  async function getMovieBySlugHydrated(slug: string) {
    const state = await loadAppState();
    const movie = getMovieBySlug(state, slug);
    await hydrateMovie(state, movie);
    return movie;
  }

  function invalidateMovieDetailPageCache() { movieDetailDataMemoryCache.clear(); }

  return {
    invalidateMovieDetailPageCache,
    getMovieDetailDataHydrated,
    getWatchEntryForMovie,
    getRatingsForMovie,
    getMovieBySlugHydrated
  };
}
