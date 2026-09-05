import { hydrateMovie } from "@/lib/movies/metadata";
import { PendingListBase } from "@/lib/pages/types";
import { generatePendingWeeklyOptions } from "@/lib/recommendations";
import { insertWeeklyBatchToDatabase } from "@/lib/recommendations/records";
import type { createRecommendationService } from "@/lib/recommendations/service";
import { readTimedCache, TimedCache, writeTimedCacheWithTtl, PAGE_ROUTE_CACHE_TTL_MS } from "@/lib/state-cache";
import type { createStateReader } from "@/lib/state-readers";
import { AppState, Movie, User } from "@/lib/types";

type Dependencies = {
  listPendingFromState: ReturnType<typeof createStateReader>["listPendingFromState"];
  getCurrentBatchFromState: ReturnType<typeof createStateReader>["getCurrentBatchFromState"];
  shouldAttemptDatabaseRead: () => boolean;
  getDatabaseReadGroup: () => AppState["group"];
  loadUsersForRead: (options?: { includeAvatarUrls?: boolean }) => Promise<User[]>;
  loadMovieCatalogFromDatabaseUncached: () => Promise<Movie[] | null>;
  loadNormalizedCollections: (groupId: string) => Promise<Pick<AppState, "pendingMovieIds" | "watchEntries" | "ratings" | "weeklyBatches">>;
  ensureStateIntegrity: (source: AppState) => AppState;
  ensureDashboardBatch: ReturnType<typeof createRecommendationService>["ensureDashboardBatch"];
  getMovieById: ReturnType<typeof createStateReader>["getMovieById"];
  hydrateMoviesForDatabaseRead: (movies: Movie[]) => Promise<void>;
  markDatabaseReadHealthy: () => void;
  markDatabaseReadFailure: (scope: string, error: unknown) => void;
  shouldUseDatabase: () => boolean;
  loadAppState: () => Promise<AppState>;
};

export function createPendingPageReader({
  listPendingFromState,
  getCurrentBatchFromState,
  shouldAttemptDatabaseRead,
  getDatabaseReadGroup,
  loadUsersForRead,
  loadMovieCatalogFromDatabaseUncached,
  loadNormalizedCollections,
  ensureStateIntegrity,
  ensureDashboardBatch,
  getMovieById,
  hydrateMoviesForDatabaseRead,
  markDatabaseReadHealthy,
  markDatabaseReadFailure,
  shouldUseDatabase,
  loadAppState
}: Dependencies) {
  type PendingListCacheKey = string;

  const pendingListMemoryCache = new Map<PendingListCacheKey, TimedCache<PendingListBase>>();

  function buildPendingListCacheKey(search: string, genre: string) {
    return `${search.toLocaleLowerCase("es")}::${genre.toLocaleLowerCase("es")}`;
  }

  function getPendingListBaseFromState(state: AppState, search: string, activeGenre: string): PendingListBase {
    const cacheKey = buildPendingListCacheKey(search, activeGenre);
    const cached = readTimedCache(pendingListMemoryCache.get(cacheKey));
    if (cached !== null) {
      return cached;
    }

    const pending = listPendingFromState(state);
    const batch = getCurrentBatchFromState(state);
    const weeklyOptions = generatePendingWeeklyOptions(state);
    const normalizedSearch = search.toLocaleLowerCase("es");
    const normalizedGenre = activeGenre.toLocaleLowerCase("es");

    const genres = Array.from(
      new Set(
        pending
          .flatMap((movie) => movie.genres)
          .map((genre) => genre.trim())
          .filter((genre) => genre && genre.toLowerCase() !== "pendiente")
      )
    ).sort((left, right) => left.localeCompare(right, "es"));

    const filteredPendingIds = pending
      .filter((movie) => {
        const matchesSearch =
          !normalizedSearch ||
          `${movie.title} ${movie.year} ${movie.director} ${movie.cast.join(" ")}`
            .toLocaleLowerCase("es")
            .includes(normalizedSearch);

        const matchesGenre =
          !normalizedGenre || movie.genres.some((genre) => genre.toLocaleLowerCase("es") === normalizedGenre);

        return matchesSearch && matchesGenre;
      })
      .map((movie) => movie.id);

    const base = {
      batch,
      genres,
      totalPendingCount: pending.length,
      filteredPendingIds,
      weeklyOptions
    };

    pendingListMemoryCache.set(cacheKey, writeTimedCacheWithTtl(base, PAGE_ROUTE_CACHE_TTL_MS));
    return base;
  }

  async function getPendingPageDataFromDatabase(input: { search?: string; genre?: string; page?: number; pageSize?: number }) {
    if (!shouldAttemptDatabaseRead()) {
      return null;
    }

    try {
      const group = getDatabaseReadGroup();
      const search = input.search?.trim() ?? "";
      const activeGenre = input.genre?.trim() ?? "";
      const currentPage = input.page && input.page > 0 ? input.page : 1;
      const itemsPerPage = input.pageSize && input.pageSize > 0 ? input.pageSize : 15;
      const [users, movies, normalizedCollections] = await Promise.all([
        loadUsersForRead(),
        loadMovieCatalogFromDatabaseUncached(),
        loadNormalizedCollections(group.id)
      ]);
      if (!movies) {
        return null;
      }
      const state = ensureStateIntegrity({
        users,
        group,
        movies,
        watchEntries: normalizedCollections.watchEntries,
        ratings: normalizedCollections.ratings,
        pendingMovieIds: normalizedCollections.pendingMovieIds,
        weeklyBatches: normalizedCollections.weeklyBatches,
        activity: []
      });
      pendingListMemoryCache.clear();
    const ensuredBatch = await ensureDashboardBatch(state);
      if (ensuredBatch.changed && ensuredBatch.batch) {
        await insertWeeklyBatchToDatabase(ensuredBatch.batch);
      }
      const { batch, genres, totalPendingCount, filteredPendingIds, weeklyOptions } = getPendingListBaseFromState(
        state,
        search,
        activeGenre
      );
      const totalPages = Math.max(1, Math.ceil(filteredPendingIds.length / itemsPerPage));
      const safePage = Math.min(currentPage, totalPages);
      const pageStart = (safePage - 1) * itemsPerPage;
      const pagedPending = filteredPendingIds
        .slice(pageStart, pageStart + itemsPerPage)
        .map((movieId) => getMovieById(state, movieId))
        .filter((movie): movie is Movie => Boolean(movie));
      const weeklyOptionsWithMovies = weeklyOptions
        .map((item) => {
          const movie = getMovieById(state, item.movieId);
          return movie ? { ...item, movie } : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      await hydrateMoviesForDatabaseRead([
        ...pagedPending,
        ...weeklyOptionsWithMovies.map((item) => item.movie)
      ]);
      markDatabaseReadHealthy();
      return {
        batch,
        genres,
        totalPendingCount,
        filteredPendingCount: filteredPendingIds.length,
        totalPages,
        currentPage: safePage,
        pagedPending,
        weeklyOptions: weeklyOptionsWithMovies
      };
    } catch (error) {
      markDatabaseReadFailure("pending page read", error);
      return null;
    }
  }

  async function getPendingPageDataHydrated(input: { search?: string; genre?: string; page?: number; pageSize?: number }) {
    pendingListMemoryCache.clear();

    if (shouldUseDatabase()) {
      const databasePendingData = await getPendingPageDataFromDatabase(input);
      if (databasePendingData) {
        return databasePendingData;
      }
    }

    const state = await loadAppState();
    const search = input.search?.trim() ?? "";
    const activeGenre = input.genre?.trim() ?? "";
    const currentPage = input.page && input.page > 0 ? input.page : 1;
    const itemsPerPage = input.pageSize && input.pageSize > 0 ? input.pageSize : 15;
    const { batch, genres, totalPendingCount, filteredPendingIds, weeklyOptions } = getPendingListBaseFromState(state, search, activeGenre);

    const moviesToHydrate = new Map<string, Movie>();
    const totalPages = Math.max(1, Math.ceil(filteredPendingIds.length / itemsPerPage));
    const safePage = Math.min(currentPage, totalPages);
    const pageStart = (safePage - 1) * itemsPerPage;
    const pagedPending = filteredPendingIds
      .slice(pageStart, pageStart + itemsPerPage)
      .map((movieId) => getMovieById(state, movieId))
      .filter((movie): movie is Movie => Boolean(movie));

    for (const movie of pagedPending) {
      moviesToHydrate.set(movie.id, movie);
    }
    for (const item of weeklyOptions) {
      const movie = getMovieById(state, item.movieId);
      if (movie) {
        moviesToHydrate.set(movie.id, movie);
      }
    }

    await Promise.all([...moviesToHydrate.values()].map((movie) => hydrateMovie(state, movie)));

    return {
      batch,
      genres,
      totalPendingCount,
      filteredPendingCount: filteredPendingIds.length,
      totalPages,
      currentPage: safePage,
      pagedPending,
      weeklyOptions: weeklyOptions
        .map((item) => {
          const movie = getMovieById(state, item.movieId);
          return movie ? { ...item, movie } : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    };
  }

  async function listPendingHydrated() {
    const state = await loadAppState();
    const pending = listPendingFromState(state);
    await Promise.all(pending.map((movie) => hydrateMovie(state, movie)));
    return listPendingFromState(state);
  }

  function invalidatePendingPageCache() { pendingListMemoryCache.clear(); }

  return { invalidatePendingPageCache, getPendingPageDataHydrated, listPendingHydrated };
}
