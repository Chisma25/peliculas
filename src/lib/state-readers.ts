import { AppState, Movie, User, UserRating, WeeklyRecommendationBatch } from "@/lib/types";
import { normalizeIdentity, normalizeUsername } from "@/lib/user-input";
import { average } from "@/lib/utils";

export type StateIndexes = {
  usersById: Map<string, User>;
  usersByUsername: Map<string, User>;
  usersByIdentity: Map<string, User>;
  moviesById: Map<string, Movie>;
  moviesByTmdbId: Map<string, Movie>;
  moviesBySlug: Map<string, Movie>;
  ratingsByMovieId: Map<string, UserRating[]>;
  ratingsByUserId: Map<string, UserRating[]>;
  ratingByUserMovie: Map<string, UserRating>;
  movieAverageById: Map<string, number>;
  watchEntriesByMovieId: Map<string, AppState["watchEntries"][number]>;
  pendingMovieIdSet: Set<string>;
  watchedMovieIdSet: Set<string>;
  currentBatch: WeeklyRecommendationBatch | null;
  weeklyBatchById: Map<string, WeeklyRecommendationBatch>;
  groupAverageScore: number;
};

// One reader per store instance; the coordinator invalidates indexes after a
// state mutation. Keeping it independent lets every domain share these lookups.
export function createStateReader() {
  const stateIndexesCache = new WeakMap<AppState, StateIndexes>();

  function getStateIndexes(state: AppState): StateIndexes {
    const cachedIndexes = stateIndexesCache.get(state);
    if (cachedIndexes) {
      return cachedIndexes;
    }

    const usersById = new Map<string, User>();
    const usersByUsername = new Map<string, User>();
    const usersByIdentity = new Map<string, User>();
    const moviesById = new Map<string, Movie>();
    const moviesByTmdbId = new Map<string, Movie>();
    const moviesBySlug = new Map<string, Movie>();
    const ratingsByMovieId = new Map<string, UserRating[]>();
    const ratingsByUserId = new Map<string, UserRating[]>();
    const ratingByUserMovie = new Map<string, UserRating>();
    const movieAverageById = new Map<string, number>();
    const watchEntriesByMovieId = new Map<string, AppState["watchEntries"][number]>();
    const pendingMovieIdSet = new Set(state.pendingMovieIds);
    const watchedMovieIdSet = new Set<string>();
    const weeklyBatchById = new Map<string, WeeklyRecommendationBatch>();

    for (const user of state.users) {
      usersById.set(user.id, user);
      usersByUsername.set(normalizeUsername(user.username), user);
      usersByIdentity.set(normalizeIdentity(user.name), user);
    }

    for (const movie of state.movies) {
      moviesById.set(movie.id, movie);
      moviesBySlug.set(movie.slug, movie);
      if (movie.sourceIds?.tmdb) {
        moviesByTmdbId.set(movie.sourceIds.tmdb, movie);
      }
    }

    for (const rating of state.ratings) {
      const movieRatings = ratingsByMovieId.get(rating.movieId) ?? [];
      movieRatings.push(rating);
      ratingsByMovieId.set(rating.movieId, movieRatings);

      const userRatings = ratingsByUserId.get(rating.userId) ?? [];
      userRatings.push(rating);
      ratingsByUserId.set(rating.userId, userRatings);

      ratingByUserMovie.set(`${rating.userId}:${rating.movieId}`, rating);
    }

    for (const [movieId, movieRatings] of ratingsByMovieId.entries()) {
      movieAverageById.set(movieId, average(movieRatings.map((rating) => rating.score)));
    }

    for (const watchEntry of state.watchEntries) {
      watchEntriesByMovieId.set(watchEntry.movieId, watchEntry);
      watchedMovieIdSet.add(watchEntry.movieId);
    }

    const currentBatch = [...state.weeklyBatches].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
    for (const batch of state.weeklyBatches) {
      weeklyBatchById.set(batch.id, batch);
    }

    const groupAverageScore = average(
      state.watchEntries
        .map((entry) => movieAverageById.get(entry.movieId))
        .filter((value): value is number => value !== undefined)
    );

    const indexes = {
      usersById,
      usersByUsername,
      usersByIdentity,
      moviesById,
      moviesByTmdbId,
      moviesBySlug,
      ratingsByMovieId,
      ratingsByUserId,
      ratingByUserMovie,
      movieAverageById,
      watchEntriesByMovieId,
      pendingMovieIdSet,
      watchedMovieIdSet,
      currentBatch,
      weeklyBatchById,
      groupAverageScore
    };

    stateIndexesCache.set(state, indexes);
    return indexes;
  }

  function findUserById(state: AppState, userId?: string | null) {
    if (!userId) {
      return null;
    }

    return getStateIndexes(state).usersById.get(userId) ?? null;
  }

  function findUserByIdentity(state: AppState, identifier?: string | null) {
    const normalizedIdentifier = normalizeIdentity(identifier ?? "");
    if (!normalizedIdentifier) {
      return null;
    }

    return (
      getStateIndexes(state).usersByUsername.get(normalizedIdentifier) ??
      getStateIndexes(state).usersByIdentity.get(normalizedIdentifier) ??
      null
    );
  }

  function getMovieById(state: AppState, movieId: string) {
    return getStateIndexes(state).moviesById.get(movieId) ?? null;
  }

  function getMovieByTmdbId(state: AppState, tmdbId: string) {
    return getStateIndexes(state).moviesByTmdbId.get(tmdbId) ?? null;
  }

  function getMovieBySlug(state: AppState, slug: string) {
    return getStateIndexes(state).moviesBySlug.get(slug) ?? null;
  }

  function getCurrentBatchFromState(state: AppState) {
    return getStateIndexes(state).currentBatch;
  }

  function getWatchEntryForMovieFromState(state: AppState, movieId: string) {
    return getStateIndexes(state).watchEntriesByMovieId.get(movieId) ?? null;
  }

  function getRatingsForMovieFromState(state: AppState, movieId: string) {
    return getStateIndexes(state).ratingsByMovieId.get(movieId) ?? [];
  }

  function getMovieAverageFromState(state: AppState, movieId: string) {
    return getStateIndexes(state).movieAverageById.get(movieId) ?? 0;
  }

  function listMembersFromState(state: AppState) {
    const { usersById } = getStateIndexes(state);
    return state.group.memberIds.map((memberId) => usersById.get(memberId)).filter((user): user is User => Boolean(user));
  }

  function listPendingFromState(state: AppState) {
    const { moviesById } = getStateIndexes(state);
    return state.pendingMovieIds.map((movieId) => moviesById.get(movieId)).filter((movie): movie is Movie => Boolean(movie));
  }

  function invalidateStateIndexes(state: AppState) { stateIndexesCache.delete(state); }

  return {
    invalidateStateIndexes,
    getStateIndexes,
    getMovieById,
    getCurrentBatchFromState,
    getMovieAverageFromState,
    listPendingFromState,
    listMembersFromState,
    getMovieBySlug,
    getRatingsForMovieFromState,
    getWatchEntryForMovieFromState,
    findUserById,
    findUserByIdentity,
    getMovieByTmdbId
  };
}
