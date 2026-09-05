import {
  fetchMovieDiscoveryPool,
  fetchNowPlayingMovies,
  fetchUpcomingMovies,
  resolveMovieMetadata
} from "@/lib/movie-provider";
import { hydrateMovie } from "@/lib/movies/metadata";
import {
  generatePendingWeeklyOptions,
  rankDiscoveryMoviesForGroup,
  rankNowPlayingForGroup,
  rankUpcomingReleasesForGroup,
  selectDiscoverySeedTmdbIds
} from "@/lib/recommendations";
import { cloneState, readTimedCache, TimedCache } from "@/lib/state-cache";
import type { createStateReader } from "@/lib/state-readers";
import { AppState, Movie, NowPlayingSuggestion, UpcomingReleaseSuggestion } from "@/lib/types";

type Dependencies = {
  getStateIndexes: ReturnType<typeof createStateReader>["getStateIndexes"];
  loadAppState: () => Promise<AppState>;
  getMovieById: ReturnType<typeof createStateReader>["getMovieById"];
};

export function createSuggestionReader({
  getStateIndexes,
  loadAppState,
  getMovieById
}: Dependencies) {
  const UPCOMING_RELEASES_CACHE_TTL_MS = 1000 * 60 * 15;

  const NOW_PLAYING_CACHE_TTL_MS = 1000 * 60 * 15;

  let upcomingReleasesMemoryCache: TimedCache<UpcomingReleaseSuggestion[]> | null = null;

  let nowPlayingMemoryCache: TimedCache<NowPlayingSuggestion[]> | null = null;

  async function buildUpcomingDashboardReleases(state: AppState) {
    const cached = readTimedCache(upcomingReleasesMemoryCache);
    if (cached) {
      return cached;
    }

    const rawUpcoming = await fetchUpcomingMovies(31, "ES", 12);
    if (rawUpcoming.length === 0) {
      return [];
    }

    const indexes = getStateIndexes(state);
    const knownTmdbIds = new Set(
      [...state.pendingMovieIds, ...state.watchEntries.map((entry) => entry.movieId)]
        .map((movieId) => indexes.moviesById.get(movieId)?.sourceIds?.tmdb)
        .filter((value): value is string => Boolean(value))
    );

    const candidates = rawUpcoming.filter((movie) => !(movie.sourceIds?.tmdb && knownTmdbIds.has(movie.sourceIds.tmdb))).slice(0, 5);

    const enrichedUpcoming = await Promise.all(candidates.map((movie) => resolveMovieMetadata(movie)));
    const ranked = rankUpcomingReleasesForGroup(state, enrichedUpcoming, 3);
    upcomingReleasesMemoryCache = {
      value: cloneState(ranked),
      expiresAt: Date.now() + UPCOMING_RELEASES_CACHE_TTL_MS
    };
    return ranked;
  }

  async function buildNowPlayingDashboardSuggestions(state: AppState) {
    const cached = readTimedCache(nowPlayingMemoryCache);
    if (cached) {
      return cached;
    }

    const rawNowPlaying = await fetchNowPlayingMovies("ES", 18);
    if (rawNowPlaying.length === 0) {
      return [];
    }

    const indexes = getStateIndexes(state);
    const knownTmdbIds = new Set(
      [...state.pendingMovieIds, ...state.watchEntries.map((entry) => entry.movieId)]
        .map((movieId) => indexes.moviesById.get(movieId)?.sourceIds?.tmdb)
        .filter((value): value is string => Boolean(value))
    );
    const candidates = rawNowPlaying
      .filter((movie) => !(movie.sourceIds?.tmdb && knownTmdbIds.has(movie.sourceIds.tmdb)))
      .slice(0, 10);
    const enrichedMovies = await Promise.all(candidates.map((movie) => resolveMovieMetadata(movie)));
    const ranked = rankNowPlayingForGroup(state, enrichedMovies, 3);

    nowPlayingMemoryCache = {
      value: cloneState(ranked),
      expiresAt: Date.now() + NOW_PLAYING_CACHE_TTL_MS
    };
    return ranked;
  }

  async function getUpcomingDashboardReleasesHydrated() {
    const state = await loadAppState();
    return buildUpcomingDashboardReleases(state);
  }

  async function getNowPlayingDashboardSuggestionsHydrated() {
    const state = await loadAppState();
    return buildNowPlayingDashboardSuggestions(state);
  }

  async function getMovieDiscoverySuggestions(input: {
    generation?: number;
    excludeTmdbIds?: string[];
  }) {
    const state = await loadAppState();
    const generation = Math.max(0, Math.min(input.generation ?? 0, 50));
    const seeds = selectDiscoverySeedTmdbIds(state, generation, 4);
    const pool = await fetchMovieDiscoveryPool(seeds, generation, 48);
    return rankDiscoveryMoviesForGroup(state, pool, 5, input.excludeTmdbIds ?? []);
  }

  async function getPendingWeeklySuggestionsHydrated() {
    const state = await loadAppState();
    const suggestions = generatePendingWeeklyOptions(state);
    const movies = suggestions
      .map((item) => getMovieById(state, item.movieId))
      .filter((movie): movie is Movie => Boolean(movie));

    await Promise.all(movies.map((movie) => hydrateMovie(state, movie)));

    return suggestions
      .map((item) => {
        const movie = getMovieById(state, item.movieId);
        if (!movie) {
          return null;
        }

        return {
          ...item,
          movie
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  function invalidateSuggestionCaches() { upcomingReleasesMemoryCache = null; nowPlayingMemoryCache = null; }

  return {
    invalidateSuggestionCaches,
    buildUpcomingDashboardReleases,
    getUpcomingDashboardReleasesHydrated,
    getNowPlayingDashboardSuggestionsHydrated,
    getMovieDiscoverySuggestions,
    getPendingWeeklySuggestionsHydrated
  };
}
