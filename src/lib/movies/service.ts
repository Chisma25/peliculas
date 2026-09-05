import type { ActivityItem, AppState, Movie, WatchEntry, WeeklyRecommendationBatch } from "@/lib/types";
import type { StateMutationRunner } from "@/lib/state-persistence";
import { resolveMovieMetadata, searchMovies } from "@/lib/movie-provider";
import { findStoredMovieForSearchResult } from "@/lib/movie-search";
import { movieNeedsHydration } from "@/lib/movies/metadata";
import { upsertMovieToDatabase, upsertPendingMovieToDatabase, removePendingMovieFromDatabase, upsertWatchEntryToDatabase } from "@/lib/movies/records";
import { safeId, slugify } from "@/lib/utils";

type MovieServiceDependencies = {
  mutateState: StateMutationRunner;
  loadAppState: () => Promise<AppState>;
  getMovieById: (state: AppState, movieId: string) => Movie | null;
  getMovieByTmdbId: (state: AppState, tmdbId: string) => Movie | null;
  getWatchEntryForMovieFromState: (state: AppState, movieId: string) => WatchEntry | null;
  getCurrentBatchFromState: (state: AppState) => WeeklyRecommendationBatch | null;
  getStateIndexes: (state: AppState) => { watchedMovieIdSet: Set<string>; pendingMovieIdSet: Set<string> };
  addActivity: (state: AppState, entry: ActivityItem) => void;
  invalidateDerivedCaches: (state: AppState) => void;
};

// Metadata preparation happens before the shared mutation coordinator. Collection
// decisions use the current state provided after that coordinator acquires its lock.

export function createMovieService({
  mutateState, loadAppState, getMovieById, getMovieByTmdbId,
  getWatchEntryForMovieFromState, getCurrentBatchFromState, getStateIndexes,
  addActivity, invalidateDerivedCaches
}: MovieServiceDependencies) {
  async function markMovieAsWatched(movieId: string, watchedOn = new Date().toISOString()) {
    return mutateState(async (state, persistStateChange) => {
      const movie = getMovieById(state, movieId);
      if (!movie) {
        throw new Error("No se encontró la película.");
      }

      const existingEntry = getWatchEntryForMovieFromState(state, movieId);
      if (existingEntry) {
        if (!existingEntry.watchedOn || state.pendingMovieIds.includes(movieId)) {
          existingEntry.watchedOn ??= watchedOn;
          state.pendingMovieIds = state.pendingMovieIds.filter((id) => id !== movieId);
          invalidateDerivedCaches(state);
          await persistStateChange(state, [
            {
              run: (client) => upsertWatchEntryToDatabase(existingEntry, client)
            },
            {
              run: (client) => removePendingMovieFromDatabase(state.group.id, movieId, client)
            }
          ]);
        }
        return existingEntry;
      }

      const currentBatch = getCurrentBatchFromState(state);
      const watchEntry = {
        id: safeId("watch", movieId),
        movieId,
        groupId: state.group.id,
        watchedOn,
        selectedForWeek: currentBatch?.selectedMovieId === movieId ? currentBatch.weekOf : undefined
      };

      state.watchEntries.unshift(watchEntry);
      state.pendingMovieIds = state.pendingMovieIds.filter((pendingMovieId) => pendingMovieId !== movieId);
      addActivity(state, {
        type: "watched",
        label: `${movie.title} pasó a vistas del grupo`,
        movieId: movie.id,
        date: watchedOn
      });

      invalidateDerivedCaches(state);
      await persistStateChange(state, [
        {
          run: (client) => upsertWatchEntryToDatabase(watchEntry, client)
        },
        {
          run: (client) => removePendingMovieFromDatabase(state.group.id, movieId, client)
        }
      ]);
      return watchEntry;
    });
  }

  async function movieSearch(query: string) {
    const state = await loadAppState();
    const results = await searchMovies(query, state.movies);
    const indexes = getStateIndexes(state);

    return results.map((movie) => {
      const storedMovie = findStoredMovieForSearchResult(movie, state.movies);
      const storedMovieId = storedMovie?.id ?? movie.id;
      const collectionStatus = indexes.watchedMovieIdSet.has(storedMovieId)
        ? ("already_watched" as const)
        : indexes.pendingMovieIdSet.has(storedMovieId)
          ? ("already_pending" as const)
          : undefined;

      return {
        ...movie,
        collectionStatus
      };
    });
  }

  async function addPendingMovie(movieInput: Movie) {
    const preparedMovie = movieNeedsHydration(movieInput) ? await resolveMovieMetadata(movieInput) : movieInput;
    return mutateState(async (state, persistStateChange) => {
      let movie =
        (movieInput.sourceIds?.tmdb ? getMovieByTmdbId(state, movieInput.sourceIds.tmdb) : null) ??
        state.movies.find((entry) => entry.slug === movieInput.slug && entry.year === movieInput.year) ??
        null;

      if (!movie) {
        movie = {
          ...preparedMovie,
          id: movieInput.sourceIds?.tmdb ? `movie_tmdb_${movieInput.sourceIds.tmdb}` : safeId("movie", movieInput.title),
          slug: slugify(movieInput.title)
        };
        state.movies.push(movie);
      }

      if (state.watchEntries.some((entry) => entry.movieId === movie.id)) {
        return {
          status: "already_watched" as const,
          movie,
          message: "Esa película ya figura en vuestras vistas."
        };
      }

      if (state.pendingMovieIds.includes(movie.id)) {
        return {
          status: "already_pending" as const,
          movie,
          message: "Esa película ya está en pendientes."
        };
      }

      const addedAt = new Date();

      state.pendingMovieIds.unshift(movie.id);
      addActivity(state, {
        type: "queued",
        label: `${movie.title} se añadió a pendientes`,
        movieId: movie.id,
        date: addedAt.toISOString()
      });

      invalidateDerivedCaches(state);
      await persistStateChange(state, [
        {
          run: (client) => upsertMovieToDatabase(movie, client)
        },
        {
          run: (client) => upsertPendingMovieToDatabase(state.group.id, movie.id, addedAt, client)
        }
      ]);
      return {
        status: "added" as const,
        movie,
        message: "Película añadida a pendientes."
      };
    });
  }

  async function removePendingMovie(movieId: string) {
    return mutateState(async (state, persistStateChange) => {
      const movie = getMovieById(state, movieId);

      if (!state.pendingMovieIds.includes(movieId)) {
        return {
          status: "not_pending" as const,
          movie,
          message: "Esa película ya no estaba en pendientes."
        };
      }

      state.pendingMovieIds = state.pendingMovieIds.filter((pendingMovieId) => pendingMovieId !== movieId);
      if (movie) {
        addActivity(state, {
          type: "queued",
          label: `${movie.title} se quitó de pendientes`,
          movieId: movie.id,
          date: new Date().toISOString()
        });
      }
      invalidateDerivedCaches(state);
      await persistStateChange(state, [
        {
          run: (client) => removePendingMovieFromDatabase(state.group.id, movieId, client)
        }
      ]);

      return {
        status: "removed" as const,
        movie,
        message: "Película quitada de pendientes."
      };
    });
  }

  return { markMovieAsWatched, movieSearch, addPendingMovie, removePendingMovie };
}
