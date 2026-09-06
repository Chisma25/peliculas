import { StatePersistenceUnavailableError } from "@/lib/state-persistence";
import { hydrateMovie } from "@/lib/movies/metadata";
import { mapWatchRecordsToStateEntries } from "@/lib/movies/records";
import { APP_REGISTRATION_FALLBACK_DATE, HistoryFilters, HistoryItem, ViewedListBase } from "@/lib/pages/types";
import { mapRatingRecordsToStateEntries } from "@/lib/ratings/records";
import { readTimedCache, TimedCache, writeTimedCacheWithTtl, PAGE_ROUTE_CACHE_TTL_MS } from "@/lib/state-cache";
import type { createStateReader } from "@/lib/state-readers";
import { AppState, Movie, UserRating } from "@/lib/types";
import { average } from "@/lib/utils";

type Dependencies = {
  getStateIndexes: ReturnType<typeof createStateReader>["getStateIndexes"];
  getMovieAverageFromState: ReturnType<typeof createStateReader>["getMovieAverageFromState"];
  shouldAttemptDatabaseRead: () => boolean;
  getDatabaseReadGroup: () => AppState["group"];
  loadMoviesByIdsFromDatabase: (movieIds: string[]) => Promise<Map<string, Movie>>;
  hydrateMoviesForDatabaseRead: (movies: Movie[]) => Promise<void>;
  markDatabaseReadHealthy: () => void;
  markDatabaseReadFailure: (scope: string, error: unknown) => void;
  shouldUseDatabase: () => boolean;
  loadAppState: () => Promise<AppState>;
};

export function createHistoryPageReader({
  getStateIndexes,
  getMovieAverageFromState,
  shouldAttemptDatabaseRead,
  getDatabaseReadGroup,
  loadMoviesByIdsFromDatabase,
  hydrateMoviesForDatabaseRead,
  markDatabaseReadHealthy,
  markDatabaseReadFailure,
  shouldUseDatabase,
  loadAppState
}: Dependencies) {
  type ViewedListCacheKey = string;

  const viewedListMemoryCache = new Map<ViewedListCacheKey, TimedCache<ViewedListBase>>();

  function buildViewedListCacheKey(input: {
    search?: string;
    year?: string;
    genre?: string;
    sort?: HistoryFilters["sort"];
    currentUserId?: string;
  }) {
    return [
      input.currentUserId ?? "guest",
      input.search?.trim().toLocaleLowerCase("es") ?? "",
      input.year?.trim() ?? "",
      input.genre?.trim().toLocaleLowerCase("es") ?? "",
      input.sort ?? "watched-desc"
    ].join("::");
  }

  function buildHistoryFromState(state: AppState, filters?: HistoryFilters, currentUserId?: string) {
    const { moviesById, ratingsByMovieId, ratingByUserMovie } = getStateIndexes(state);
    const watchedMovies: HistoryItem[] = state.watchEntries.flatMap((entry) => {
      const movie = moviesById.get(entry.movieId);
      if (!movie) {
        return [];
      }

      const ratings = ratingsByMovieId.get(movie.id) ?? [];
      const userRating = currentUserId ? ratingByUserMovie.get(`${currentUserId}:${movie.id}`)?.score : undefined;

      return [
        {
          movie,
          watchedOn: entry.watchedOn ?? APP_REGISTRATION_FALLBACK_DATE,
          groupAverage: getMovieAverageFromState(state, movie.id),
          ratings,
          userRating
        }
      ];
    });

    const filtered = watchedMovies.filter((item) => {
      const genreMatch = filters?.genre ? item.movie.genres.includes(filters.genre) : true;
      const yearMatch = filters?.year ? String(item.movie.year) === filters.year : true;
      const searchMatch = filters?.search ? item.movie.title.toLowerCase().includes(filters.search.toLowerCase()) : true;
      return genreMatch && yearMatch && searchMatch;
    });

    const sort = filters?.sort ?? "watched-desc";
    return [...filtered].sort((left, right) => {
      if (sort === "group-desc") {
        return right.groupAverage - left.groupAverage || right.movie.year - left.movie.year;
      }

      if (sort === "group-asc") {
        return left.groupAverage - right.groupAverage || left.movie.year - right.movie.year;
      }

      if (sort === "mine-desc") {
        return (right.userRating ?? -1) - (left.userRating ?? -1) || right.groupAverage - left.groupAverage;
      }

      if (sort === "mine-asc") {
        return (left.userRating ?? 11) - (right.userRating ?? 11) || left.groupAverage - right.groupAverage;
      }

      return (new Date(right.watchedOn ?? 0).getTime() || 0) - (new Date(left.watchedOn ?? 0).getTime() || 0);
    });
  }

  function getViewedListBaseFromState(
    state: AppState,
    input: {
      search?: string;
      year?: string;
      genre?: string;
      sort?: HistoryFilters["sort"];
      currentUserId?: string;
    }
  ): ViewedListBase {
    const cacheKey = buildViewedListCacheKey(input);
    const cached = readTimedCache(viewedListMemoryCache.get(cacheKey));
    if (cached !== null) {
      return cached;
    }

    const indexes = getStateIndexes(state);
    const allHistory = state.watchEntries
      .flatMap((entry) => {
        const movie = indexes.moviesById.get(entry.movieId);
        if (!movie) {
          return [];
        }

        const userRating = input.currentUserId ? indexes.ratingByUserMovie.get(`${input.currentUserId}:${movie.id}`)?.score : undefined;

        return [
          {
            movieId: movie.id,
            watchedOn: entry.watchedOn ?? APP_REGISTRATION_FALLBACK_DATE,
            groupAverage: getMovieAverageFromState(state, movie.id),
            userRating
          }
        ];
      });

    const normalizedSearch = input.search?.trim().toLocaleLowerCase("es") ?? "";
    const normalizedGenre = input.genre?.trim().toLocaleLowerCase("es") ?? "";
    const activeYear = input.year?.trim() ?? "";

    const filteredHistory = allHistory
      .filter((item) => {
        const movie = indexes.moviesById.get(item.movieId);
        if (!movie) {
          return false;
        }

        const genreMatch = !normalizedGenre || movie.genres.some((genre) => genre.toLocaleLowerCase("es") === normalizedGenre);
        const yearMatch = !activeYear || String(movie.year) === activeYear;
        const searchMatch = !normalizedSearch || movie.title.toLocaleLowerCase("es").includes(normalizedSearch);
        return genreMatch && yearMatch && searchMatch;
      })
      .sort((left, right) => {
        const sort = input.sort ?? "watched-desc";
        const leftMovie = indexes.moviesById.get(left.movieId);
        const rightMovie = indexes.moviesById.get(right.movieId);
        if (!leftMovie || !rightMovie) {
          return 0;
        }

        if (sort === "group-desc") {
          return right.groupAverage - left.groupAverage || rightMovie.year - leftMovie.year;
        }

        if (sort === "group-asc") {
          return left.groupAverage - right.groupAverage || leftMovie.year - rightMovie.year;
        }

        if (sort === "mine-desc") {
          return (right.userRating ?? -1) - (left.userRating ?? -1) || right.groupAverage - left.groupAverage;
        }

        if (sort === "mine-asc") {
          return (left.userRating ?? 11) - (right.userRating ?? 11) || left.groupAverage - right.groupAverage;
        }

        return (new Date(right.watchedOn ?? 0).getTime() || 0) - (new Date(left.watchedOn ?? 0).getTime() || 0);
      });

    const genres = Array.from(
      new Set(
        allHistory
          .flatMap((item) => indexes.moviesById.get(item.movieId)?.genres ?? [])
          .map((genre) => genre.trim())
          .filter((genre) => genre && genre.toLowerCase() !== "pendiente")
      )
    ).sort((left, right) => left.localeCompare(right, "es"));

    const base = {
      genres,
      totalHistoryCount: allHistory.length,
      filteredHistory
    };

    viewedListMemoryCache.set(cacheKey, writeTimedCacheWithTtl(base, PAGE_ROUTE_CACHE_TTL_MS));
    return base;
  }

  async function getViewedPageDataFromDatabase(input: {
    search?: string;
    year?: string;
    genre?: string;
    sort?: HistoryFilters["sort"];
    currentUserId?: string;
    page?: number;
    pageSize?: number;
  }) {
    if (!shouldAttemptDatabaseRead()) {
      return null;
    }

    try {
      const { prisma } = await import("@/lib/prisma");
      const groupId = getDatabaseReadGroup().id;
      const currentPage = input.page && input.page > 0 ? input.page : 1;
      const itemsPerPage = input.pageSize && input.pageSize > 0 ? input.pageSize : 15;
      const watchRows = await prisma.watchEntryRecord.findMany({
        where: { groupId },
        orderBy: [{ watchedOn: "desc" }, { createdAt: "desc" }]
      });
      const watchEntries = mapWatchRecordsToStateEntries(watchRows);
      const watchedMovieIds = watchEntries.map((entry) => entry.movieId);
      const [moviesById, ratingRows] = await Promise.all([
        loadMoviesByIdsFromDatabase(watchedMovieIds),
        watchedMovieIds.length > 0
          ? prisma.ratingRecord.findMany({
              where: { movieId: { in: watchedMovieIds } },
              orderBy: [{ watchedOn: "desc" }, { updatedAt: "desc" }]
            })
          : Promise.resolve([])
      ]);
      const ratings = mapRatingRecordsToStateEntries(ratingRows);
      if (watchedMovieIds.length > 0 && moviesById.size === 0) {
        return null;
      }

      const ratingsByMovieId = new Map<string, UserRating[]>();
      const ratingByUserMovie = new Map<string, UserRating>();
      for (const rating of ratings) {
        const movieRatings = ratingsByMovieId.get(rating.movieId) ?? [];
        movieRatings.push(rating);
        ratingsByMovieId.set(rating.movieId, movieRatings);
        ratingByUserMovie.set(`${rating.userId}:${rating.movieId}`, rating);
      }

      const allHistory = watchEntries.flatMap((entry) => {
        const movie = moviesById.get(entry.movieId);
        if (!movie) {
          return [];
        }

        return [
          {
            movieId: movie.id,
            watchedOn: entry.watchedOn ?? APP_REGISTRATION_FALLBACK_DATE,
            groupAverage: average((ratingsByMovieId.get(movie.id) ?? []).map((rating) => rating.score)),
            userRating: input.currentUserId ? ratingByUserMovie.get(`${input.currentUserId}:${movie.id}`)?.score : undefined
          }
        ];
      });

      const featuredHistory: HistoryItem[] = [...allHistory]
        .sort((left, right) => right.groupAverage - left.groupAverage)
        .slice(0, 1)
        .flatMap((item) => {
        const movie = moviesById.get(item.movieId);
        if (!movie) {
          return [];
        }

        return [
          {
            movie,
            watchedOn: item.watchedOn,
            groupAverage: item.groupAverage,
            ratings: ratingsByMovieId.get(item.movieId) ?? [],
            userRating: item.userRating
          }
        ];
        });

      const normalizedSearch = input.search?.trim().toLocaleLowerCase("es") ?? "";
      const normalizedGenre = input.genre?.trim().toLocaleLowerCase("es") ?? "";
      const activeYear = input.year?.trim() ?? "";
      const filteredHistory = allHistory
        .filter((item) => {
          const movie = moviesById.get(item.movieId);
          if (!movie) {
            return false;
          }

          const genreMatch = !normalizedGenre || movie.genres.some((genre) => genre.toLocaleLowerCase("es") === normalizedGenre);
          const yearMatch = !activeYear || String(movie.year) === activeYear;
          const searchMatch = !normalizedSearch || movie.title.toLocaleLowerCase("es").includes(normalizedSearch);
          return genreMatch && yearMatch && searchMatch;
        })
        .sort((left, right) => {
          const sort = input.sort ?? "watched-desc";
          const leftMovie = moviesById.get(left.movieId);
          const rightMovie = moviesById.get(right.movieId);
          if (!leftMovie || !rightMovie) {
            return 0;
          }

          if (sort === "group-desc") {
            return right.groupAverage - left.groupAverage || rightMovie.year - leftMovie.year;
          }

          if (sort === "group-asc") {
            return left.groupAverage - right.groupAverage || leftMovie.year - rightMovie.year;
          }

          if (sort === "mine-desc") {
            return (right.userRating ?? -1) - (left.userRating ?? -1) || right.groupAverage - left.groupAverage;
          }

          if (sort === "mine-asc") {
            return (left.userRating ?? 11) - (right.userRating ?? 11) || left.groupAverage - right.groupAverage;
          }

          return (new Date(right.watchedOn ?? 0).getTime() || 0) - (new Date(left.watchedOn ?? 0).getTime() || 0);
        });

      const genres = Array.from(
        new Set(
          allHistory
            .flatMap((item) => moviesById.get(item.movieId)?.genres ?? [])
            .map((genre) => genre.trim())
            .filter((genre) => genre && genre.toLowerCase() !== "pendiente")
        )
      ).sort((left, right) => left.localeCompare(right, "es"));
      const totalPages = Math.max(1, Math.ceil(filteredHistory.length / itemsPerPage));
      const safePage = Math.min(currentPage, totalPages);
      const pageStart = (safePage - 1) * itemsPerPage;
      const pagedHistory: HistoryItem[] = filteredHistory
        .slice(pageStart, pageStart + itemsPerPage)
        .flatMap((item) => {
          const movie = moviesById.get(item.movieId);
          if (!movie) {
            return [];
          }

          return [
            {
              movie,
              watchedOn: item.watchedOn,
              groupAverage: item.groupAverage,
              ratings: ratingsByMovieId.get(item.movieId) ?? [],
              userRating: item.userRating
            }
          ];
        });

      await hydrateMoviesForDatabaseRead(
        [...new Map([...featuredHistory, ...pagedHistory].map((item) => [item.movie.id, item.movie])).values()]
      );
      markDatabaseReadHealthy();
      return {
        genres,
        totalHistoryCount: allHistory.length,
        filteredHistoryCount: filteredHistory.length,
        totalPages,
        currentPage: safePage,
        featuredHistory,
        pagedHistory
      };
    } catch (error) {
      if (error instanceof StatePersistenceUnavailableError) throw error;
      markDatabaseReadFailure("viewed page read", error);
      return null;
    }
  }

  async function getViewedPageDataHydrated(input: {
    search?: string;
    year?: string;
    genre?: string;
    sort?: HistoryFilters["sort"];
    currentUserId?: string;
    page?: number;
    pageSize?: number;
  }) {
    if (shouldUseDatabase()) {
      const databaseViewedData = await getViewedPageDataFromDatabase(input);
      if (databaseViewedData) {
        return databaseViewedData;
      }
    }

    const state = await loadAppState();
    const indexes = getStateIndexes(state);
    const currentPage = input.page && input.page > 0 ? input.page : 1;
    const itemsPerPage = input.pageSize && input.pageSize > 0 ? input.pageSize : 15;
    const { genres, totalHistoryCount, filteredHistory } = getViewedListBaseFromState(state, {
      search: input.search,
      year: input.year,
      genre: input.genre,
      sort: input.sort,
      currentUserId: input.currentUserId
    });

    const { filteredHistory: featuredBase } = getViewedListBaseFromState(state, {
      sort: "group-desc",
      currentUserId: input.currentUserId
    });

    const moviesToHydrate = new Map<string, Movie>();
    const totalPages = Math.max(1, Math.ceil(filteredHistory.length / itemsPerPage));
    const safePage = Math.min(currentPage, totalPages);
    const pageStart = (safePage - 1) * itemsPerPage;
    const pagedHistory = filteredHistory
      .slice(pageStart, pageStart + itemsPerPage)
      .map((item) => {
        const movie = indexes.moviesById.get(item.movieId);
        if (!movie) {
          return null;
        }

        return {
          movie,
          watchedOn: item.watchedOn,
          groupAverage: item.groupAverage,
          ratings: indexes.ratingsByMovieId.get(item.movieId) ?? [],
          userRating: item.userRating
        };
      })
      .filter((item): item is HistoryItem => Boolean(item));

    const featuredHistory = featuredBase
      .slice(0, 1)
      .map((item) => {
        const movie = indexes.moviesById.get(item.movieId);
        if (!movie) {
          return null;
        }

        return {
          movie,
          watchedOn: item.watchedOn,
          groupAverage: item.groupAverage,
          ratings: indexes.ratingsByMovieId.get(item.movieId) ?? [],
          userRating: item.userRating
        };
      })
      .filter((item): item is HistoryItem => Boolean(item));

    for (const item of pagedHistory) {
      moviesToHydrate.set(item.movie.id, item.movie);
    }
    for (const item of featuredHistory) {
      moviesToHydrate.set(item.movie.id, item.movie);
    }

    await Promise.all([...moviesToHydrate.values()].map((movie) => hydrateMovie(state, movie)));

    return {
      genres,
      totalHistoryCount,
      filteredHistoryCount: filteredHistory.length,
      totalPages,
      currentPage: safePage,
      featuredHistory,
      pagedHistory
    };
  }

  async function listHistory(filters?: HistoryFilters, currentUserId?: string) {
    const state = await loadAppState();
    return buildHistoryFromState(state, filters, currentUserId);
  }

  async function listHistoryHydrated(filters?: HistoryFilters, currentUserId?: string) {
    const state = await loadAppState();
    const history = buildHistoryFromState(state, filters, currentUserId);
    await Promise.all(history.map((item) => hydrateMovie(state, item.movie)));
    return buildHistoryFromState(state, filters, currentUserId);
  }

  function invalidateHistoryPageCache() { viewedListMemoryCache.clear(); }

  return { invalidateHistoryPageCache, getViewedPageDataHydrated, listHistory, listHistoryHydrated };
}
