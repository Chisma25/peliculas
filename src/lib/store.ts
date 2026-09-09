import { createMovieMetadataWriter } from "@/lib/movies/metadata-writer";
import { cleanTechnicalMovies } from "@/lib/database-maintenance.mjs";
import {
  isMovie,
  mapMovieRecordsToStateMovies,
  mapWatchRecordsToStateEntries
} from "@/lib/movies/records";
import { createMovieService } from "@/lib/movies/service";
import { createDashboardPageReader } from "@/lib/pages/dashboard";
import { createHistoryPageReader } from "@/lib/pages/history";
import { createMovieDetailPageReader } from "@/lib/pages/movie-detail";
import { createPendingPageReader } from "@/lib/pages/pending";
import { createProfilePageReader } from "@/lib/pages/profiles";

import { mapRatingRecordsToStateEntries } from "@/lib/ratings/records";
import { createRatingService } from "@/lib/ratings/service";
import {
  mapWeeklyBatchRecordsToStateEntries
} from "@/lib/recommendations/records";
import { createRecommendationService } from "@/lib/recommendations/service";
import { createSuggestionReader } from "@/lib/recommendations/suggestions";
import {
  TimedCache,
  cloneState,
  readTimedCache,
  writeTimedCacheWithTtl,
  PAGE_ROUTE_CACHE_TTL_MS
} from "@/lib/state-cache";
import { createStateReader } from "@/lib/state-readers";
import type { Prisma } from "@prisma/client";
import { cache } from "react";

import {
  ensureDatabaseReadCanProceed,
  failClosedAfterDatabaseReadError,
  shouldFailClosedOnDatabaseError
} from "@/lib/data-availability";
import { seedState } from "@/lib/demo-data";
import { assertDatabaseEnvironmentSafety } from "@/lib/environment-safety";
import {
  readLocalState,
  saveLocalState,
  saveLocalStateStrict
} from "@/lib/local-state-storage";
import { loadManualHistorySeed } from "@/lib/manual-history";
import { createLocalMutationQueue, withDatabaseMutation } from "@/lib/mutation-lock";
import { mergeNormalizedState, toCompactSnapshotState, type NormalizedStateCollections } from "@/lib/normalized-state";
import { shouldUseProcessLocalMutableCache } from "@/lib/runtime-cache-policy";
import {
  StatePersistenceUnavailableError,
  commitStateChangeAtomically,
  type PersistMutation
} from "@/lib/state-persistence";
import { ActivityItem, AppState, Movie, User } from "@/lib/types";
import { createAuthenticationService } from "@/lib/users/authentication";
import { createProfileReader } from "@/lib/users/profiles";
import {
  USER_RECORD_WITH_AVATAR_SELECT,
  ensureUserCredentials,
  mapUserRecordsToStateUsers,
  readUsersFromDatabase
} from "@/lib/users/records";
import { createUserService } from "@/lib/users/service";
const SNAPSHOT_ID = process.env.APP_SNAPSHOT_ID || "main";

const DATABASE_READ_BACKOFF_MS = 1000 * 60;
const DATABASE_QUOTA_BACKOFF_MS = 1000 * 60 * 30;
const LIVE_STATE_CACHE_TTL_MS = 1000 * 60 * 10;

const REMOVED_TEST_USER_IDS = new Set(["user_xisma25"]);

let snapshotUsersMemoryCache: TimedCache<User[]> | null = null;
let snapshotUsersWithAvatarsMemoryCache: TimedCache<User[]> | null = null;

let databaseReadBackoffUntil = 0;
let databaseWriteBackoffUntil = 0;
let liveStateMemoryCache: TimedCache<AppState> | null = null;
let previewDataHygienePromise: Promise<void> | null = null;

const {
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
} = createStateReader();

// The store remains the composition root: domain modules never import it.
// Mutations receive the same coordinator used by movies and recommendations.
const { getProfileSummaryFromState, buildProfileFromState, invalidateProfileCaches } = createProfileReader({
  getStateIndexes,
  findUserById
});
export const { getSessionCookieName, getSessionUserFromToken, getSessionUser, authenticateUser } =
  createAuthenticationService(loadUsersForAuthentication);
export const { updateUserProfile, updateUserCredentialsByAdmin, resetUserCredentials } = createUserService({
  mutateState,
  findUserById,
  findUserByIdentity,
  addActivity,
  invalidateDerivedCaches
});

export const { markMovieAsWatched, movieSearch, addPendingMovie, removePendingMovie } = createMovieService({
  mutateState,
  loadAppState: () => loadAppState(),
  getMovieById,
  getMovieByTmdbId,
  getWatchEntryForMovieFromState,
  getCurrentBatchFromState,
  getStateIndexes,
  addActivity,
  invalidateDerivedCaches
});
export const { upsertRating } = createRatingService({
  mutateState,
  findUserById,
  getMovieById,
  getStateIndexes,
  addActivity,
  invalidateDerivedCaches
});

const { hydrateMoviesForDatabaseRead } = createMovieMetadataWriter({ mutateState, invalidateDerivedCaches });

const { loadStateWithCurrentBatch, getCurrentBatch, generateBatch, selectWeeklyMovie } = createRecommendationService({
  getStateIndexes,
  getMovieById,
  getCurrentBatchFromState,
  invalidateDerivedCaches,
  mutateState,
  addActivity
});

const {
  invalidateSuggestionCaches,
  buildUpcomingDashboardReleases,
  getUpcomingDashboardReleasesHydrated,
  getNowPlayingDashboardSuggestionsHydrated,
  getMovieDiscoverySuggestions,
  getPendingWeeklySuggestionsHydrated
} = createSuggestionReader({
  getStateIndexes,
  loadAppState: () => loadAppState(),
  getMovieById
});

const { invalidateHistoryPageCache, getViewedPageDataHydrated, listHistory, listHistoryHydrated } = createHistoryPageReader({
  getStateIndexes,
  getMovieAverageFromState,
  shouldAttemptDatabaseRead,
  getDatabaseReadGroup,
  loadMoviesByIdsFromDatabase,
  hydrateMoviesForDatabaseRead,
  markDatabaseReadHealthy,
  markDatabaseReadFailure,
  shouldUseDatabase,
  loadAppState: () => loadAppState()
});

const { invalidatePendingPageCache, getPendingPageDataHydrated, listPendingHydrated } = createPendingPageReader({
  listPendingFromState,
  getCurrentBatchFromState,
  shouldAttemptDatabaseRead,
  loadStateWithCurrentBatch,
  getMovieById,
  hydrateMoviesForDatabaseRead,
  markDatabaseReadHealthy,
  markDatabaseReadFailure,
  shouldUseDatabase,
  loadAppState: () => loadAppState()
});

const { invalidateProfilePageCaches, getProfileDataHydrated, getGroupPageData, listMembers, getUserByUsername } = createProfilePageReader({
  shouldAttemptDatabaseRead,
  loadUsersForRead,
  loadMoviesByIdsFromDatabase,
  hydrateMoviesForDatabaseRead,
  markDatabaseReadHealthy,
  markDatabaseReadFailure,
  shouldUseDatabase,
  loadAppState: () => loadAppState(),
  buildProfileFromState,
  getDatabaseReadGroup,
  listMembersFromState,
  getProfileSummaryFromState,
  loadSnapshotUsersForRequest: () => loadSnapshotUsersForRequest()
});

const {
  invalidateMovieDetailPageCache,
  getMovieDetailDataHydrated,
  getWatchEntryForMovie,
  getRatingsForMovie,
  getMovieBySlugHydrated
} = createMovieDetailPageReader({
  shouldAttemptDatabaseRead,
  loadMovieBySlugFromDatabase,
  hydrateMoviesForDatabaseRead,
  loadUsersForRead,
  markDatabaseReadHealthy,
  markDatabaseReadFailure,
  shouldUseDatabase,
  loadAppState: () => loadAppState(),
  getMovieBySlug,
  getRatingsForMovieFromState,
  getWatchEntryForMovieFromState,
  listMembersFromState,
  getMovieAverageFromState,
  getStateIndexes
});

const { getDashboardData, getDashboardOverviewHydrated, getDashboardDataHydrated } = createDashboardPageReader({
  getStateIndexes,
  getCurrentBatchFromState,
  getMovieById,
  getWatchEntryForMovieFromState,
  loadAppState: () => loadAppState(),
  buildUpcomingDashboardReleases,
  getUpcomingDashboardReleasesHydrated
});

export {
  generateBatch,
  getCurrentBatch,
  getDashboardData,
  getDashboardDataHydrated,
  getDashboardOverviewHydrated,
  getGroupPageData,
  getMovieBySlugHydrated,
  getMovieDetailDataHydrated,
  getMovieDiscoverySuggestions,
  getNowPlayingDashboardSuggestionsHydrated,
  getPendingPageDataHydrated,
  getPendingWeeklySuggestionsHydrated,
  getProfileDataHydrated,
  getRatingsForMovie,
  getUpcomingDashboardReleasesHydrated,
  getUserByUsername,
  getViewedPageDataHydrated,
  getWatchEntryForMovie,
  listHistory,
  listHistoryHydrated,
  listMembers,
  listPendingHydrated,
  selectWeeklyMovie
};

function invalidateDerivedCaches(state: AppState) {
  invalidateStateIndexes(state);
  invalidateProfileCaches(state);
}

function invalidatePersistentStateCache() {
  snapshotUsersMemoryCache = null;
  snapshotUsersWithAvatarsMemoryCache = null;
  invalidateSuggestionCaches();
  invalidateProfilePageCaches();
  invalidateMovieDetailPageCache();
  invalidatePendingPageCache();
  invalidateHistoryPageCache();
}

function normalizeLegacyActivityLabel(label: string) {
  return label
    .replace(/\bactualizo\b/g, "actualizó")
    .replace(/\banadio\b/g, "añadió")
    .replace(/\bquito\b/g, "quitó")
    .replace(/\bpuntuo\b/g, "puntuó")
    .replace(/\bgenero\b/g, "generó")
    .replace(/\brestablecio\b/g, "restableció")
    .replace(/\bpaso\b/g, "pasó")
    .replace(/\bcambio\b/g, "cambió")
    .replace(/\bpelicula\b/g, "película")
    .replace(/\bpeliculas\b/g, "películas")
    .replace(/\bhistorico\b/g, "histórico")
    .replace(/\bcontraseña\b/g, "contraseña")
    .replace(/\beleccion\b/g, "elección")
    .replace(/\bsemanal\b/g, "semanal")
    .replace(/\bpeli\b/g, "peli");
}

function buildInitialState(): AppState {
  const manualSeed = loadManualHistorySeed();
  if (!manualSeed) {
    return ensureStateIntegrity(structuredClone(seedState));
  }

  const seenSlugs = new Set(manualSeed.movies.map((movie) => movie.slug));
  const recommendationPool = seedState.movies.filter((movie) => !seenSlugs.has(movie.slug));

  const picks = recommendationPool.slice(0, 5);

  return ensureStateIntegrity({
    users: manualSeed.users,
    group: {
      id: "group_cine_club",
      name: "Cine club",
      memberIds: manualSeed.users.map((user) => user.id),
      accentColor: "#d3542a"
    },
    movies: [...manualSeed.movies, ...recommendationPool],
    watchEntries: manualSeed.watchEntries,
    ratings: manualSeed.ratings,
    pendingMovieIds: [],
    weeklyBatches:
      picks.length > 0
        ? [
            {
              id: "batch_current",
              groupId: "group_cine_club",
              weekOf: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              selectedMovieId: picks[0].id,
              items: picks.map((movie, index) => ({
                id: `batch_item_${index + 1}`,
                movieId: movie.id,
                score: 89 - index * 3,
                summary:
                  index === 0
                    ? "Puede ser una gran elección porque es la que mejor equilibra calidad, afinidad y plan de grupo."
                    : index === 1
                      ? "Os puede encajar porque cambia el tono sin alejarse demasiado de vuestros gustos."
                      : "Puede merecer la pena porque aporta variedad real frente a lo que soléis ver juntos.",
                reasons: []
              }))
            }
          ]
        : [],
    activity: [
      {
        type: "watched",
        label: `Se cargó el histórico del grupo con ${manualSeed.movies.length} películas vistas`,
        date: new Date().toISOString()
      }
    ]
  });
}

async function loadUsersForAuthentication() {
  return shouldUseDatabase()
    ? (await loadUsersFromDatabaseUncached({ includeAvatarUrls: true })) ?? []
    : (loadLocalStateFromDisk() ?? await loadAppStateUncached()).users;
}

const loadSnapshotUsersForRequest = cache(async () => loadUsersForRead());

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AppState>;
  return (
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.movies) &&
    Array.isArray(candidate.watchEntries) &&
    Array.isArray(candidate.ratings) &&
    Array.isArray(candidate.pendingMovieIds) &&
    Array.isArray(candidate.weeklyBatches) &&
    Array.isArray(candidate.activity) &&
    typeof candidate.group === "object"
  );
}

function ensureStateIntegrity(source: AppState) {
  const removedUserIds = new Set<string>();
  const users = source.users
    .filter((user) => {
      const shouldRemove = REMOVED_TEST_USER_IDS.has(user.id);
      if (shouldRemove) {
        removedUserIds.add(user.id);
      }
      return !shouldRemove;
    })
    .map((user) => ensureUserCredentials(user));
  const memberIds = source.group.memberIds.filter((memberId) => users.some((user) => user.id === memberId));
  const missingMemberIds = users.map((user) => user.id).filter((userId) => !memberIds.includes(userId));
  const activity = source.activity
    .filter((entry) => !entry.userId || !removedUserIds.has(entry.userId))
    .map((entry) => ({
      ...entry,
      label: normalizeLegacyActivityLabel(entry.label)
    }));

  return {
    ...source,
    ratings: source.ratings.filter((rating) => !removedUserIds.has(rating.userId)),
    users,
    group: {
      ...source.group,
      memberIds: [...memberIds, ...missingMemberIds]
    },
    activity
  };
}

function shouldUseDatabase() {
  return assertDatabaseEnvironmentSafety().usesDatabase;
}

async function ensurePreviewDataHygiene() {
  if (process.env.APP_ENV?.trim().toLowerCase() !== "preview") {
    return;
  }
  if (previewDataHygienePromise) {
    return previewDataHygienePromise;
  }

  previewDataHygienePromise = (async () => {
    const { prisma } = await import("@/lib/prisma");
    const removed = await cleanTechnicalMovies(prisma, { apply: true });
    if (removed.length > 0) invalidatePersistentStateCache();
  })().catch((error) => {
    previewDataHygienePromise = null;
    console.error("[store] No se pudo limpiar la información técnica de Preview.", error);
  });

  return previewDataHygienePromise;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.toLowerCase();
  }

  return String(error).toLowerCase();
}

function isDatabaseQuotaExceededError(error: unknown) {
  const message = getErrorMessage(error);
  return (
    message.includes("exceeded the data transfer quota") ||
    message.includes("exceeded your free plan quota") ||
    message.includes("quota") ||
    message.includes("billing cycle")
  );
}

function getBackoffDuration(error: unknown, fallbackMs: number) {
  return isDatabaseQuotaExceededError(error) ? Math.max(fallbackMs, DATABASE_QUOTA_BACKOFF_MS) : fallbackMs;
}

function shouldAttemptDatabaseRead() {
  return ensureDatabaseReadCanProceed({
    usesDatabase: shouldUseDatabase(),
    backoffUntil: databaseReadBackoffUntil
  });
}

function shouldAttemptDatabaseWrite() {
  return shouldUseDatabase() && Date.now() >= databaseWriteBackoffUntil;
}

function markDatabaseReadHealthy() {
  databaseReadBackoffUntil = 0;
}

function markDatabaseWriteHealthy() {
  databaseWriteBackoffUntil = 0;
}

function markDatabaseReadFailure(scope: string, error: unknown) {
  const backoffMs = getBackoffDuration(error, DATABASE_READ_BACKOFF_MS);
  databaseReadBackoffUntil = Date.now() + backoffMs;
  if (isDatabaseQuotaExceededError(error)) {
    databaseWriteBackoffUntil = Math.max(databaseWriteBackoffUntil, Date.now() + backoffMs);
  }
  console.error(`[store] Database read failed in ${scope}.`, error);
  failClosedAfterDatabaseReadError();
}

function loadLocalStateFromDisk() {
  const state = readLocalState(isAppState, ensureStateIntegrity);
  if (state) {
    rememberLiveState(state);
  }
  return state;
}

function saveLocalStateToDisk(state: AppState) {
  saveLocalState(state);
}

function saveLocalStateToDiskStrict(state: AppState) {
  saveLocalStateStrict(state);
}

function rememberLiveState(state: AppState) {
  liveStateMemoryCache = writeTimedCacheWithTtl(state, LIVE_STATE_CACHE_TTL_MS);
}

function loadFallbackState() {
  const liveState = readTimedCache(liveStateMemoryCache);
  if (liveState) {
    return liveState;
  }

  const localState = loadLocalStateFromDisk();
  if (localState) {
    rememberLiveState(localState);
    return localState;
  }

  const initial = buildInitialState();
  rememberLiveState(initial);
  return initial;
}

async function loadNormalizedCollections(groupId: string, client?: Prisma.TransactionClient) {
  const prisma = client ?? (await import("@/lib/prisma")).prisma;
  const [pendingRows, watchRows, ratingRows, batchRows] = await Promise.all([
    prisma.pendingMovie.findMany({
      where: { groupId },
      orderBy: { addedAt: "desc" }
    }),
    prisma.watchEntryRecord.findMany({
      where: { groupId },
      orderBy: [{ watchedOn: "desc" }, { createdAt: "desc" }]
    }),
    prisma.ratingRecord.findMany({
      orderBy: [{ watchedOn: "desc" }, { updatedAt: "desc" }]
    }),
    prisma.weeklyBatchRecord.findMany({
      where: { groupId },
      orderBy: [{ createdAt: "desc" }],
      include: {
        items: {
          orderBy: { position: "asc" }
        }
      }
    })
  ]);

  return {
    pendingMovieIds: pendingRows.map((entry) => entry.movieId),
    watchEntries: mapWatchRecordsToStateEntries(watchRows),
    ratings: mapRatingRecordsToStateEntries(ratingRows),
    weeklyBatches: mapWeeklyBatchRecordsToStateEntries(batchRows)
  };
}

async function loadNormalizedStateCollections(groupId: string, client?: Prisma.TransactionClient): Promise<NormalizedStateCollections> {
  const prisma = client ?? (await import("@/lib/prisma")).prisma;
  const [userRows, movieRows, collections] = await Promise.all([
    prisma.userRecord.findMany({
      select: USER_RECORD_WITH_AVATAR_SELECT,
      orderBy: { name: "asc" }
    }),
    prisma.movieRecord.findMany({
      select: { data: true },
      orderBy: { slug: "asc" }
    }),
    loadNormalizedCollections(groupId, client)
  ]);

  return {
    users: mapUserRecordsToStateUsers(userRows, { useDeliveryUrls: false }),
    movies: mapMovieRecordsToStateMovies(movieRows),
    ...collections
  };
}

async function loadUsersFromDatabaseUncached(options: { includeAvatarUrls?: boolean } = {}): Promise<User[] | null> {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    await ensurePreviewDataHygiene();
    const users = await readUsersFromDatabase(options);
    markDatabaseReadHealthy();
    return users;
  } catch (error) {
    markDatabaseReadFailure("users read", error);
    return null;
  }
}

async function loadUsersForRead(options: { includeAvatarUrls?: boolean } = {}): Promise<User[]> {
  const includeAvatarUrls = Boolean(options.includeAvatarUrls);
  const usesDatabase = shouldUseDatabase();
  const shouldUseMemoryCache = shouldUseProcessLocalMutableCache(usesDatabase);
  const cacheRef = includeAvatarUrls ? snapshotUsersWithAvatarsMemoryCache : snapshotUsersMemoryCache;

  if (usesDatabase) {
    const databaseUsers = await loadUsersFromDatabaseUncached({ includeAvatarUrls });
    if (databaseUsers) {
      return cloneState(databaseUsers);
    }
  }

  if (shouldUseMemoryCache) {
    const cached = readTimedCache(cacheRef);
    if (cached) {
      return cached;
    }
  }

  const snapshot = await loadSnapshotStateUncached();
  if (!snapshot && shouldFailClosedOnDatabaseError()) {
    failClosedAfterDatabaseReadError();
  }
  const sourceUsers = snapshot?.users ?? loadFallbackState().users;
  const users: User[] = cloneState(
    includeAvatarUrls
      ? sourceUsers
      : sourceUsers.map((user) => ({
          ...user,
          avatarUrl: undefined
        }))
  );
  if (shouldUseMemoryCache) {
    if (includeAvatarUrls) {
      snapshotUsersWithAvatarsMemoryCache = writeTimedCacheWithTtl(users, PAGE_ROUTE_CACHE_TTL_MS);
    } else {
      snapshotUsersMemoryCache = writeTimedCacheWithTtl(users, PAGE_ROUTE_CACHE_TTL_MS);
    }
  }

  return users;
}

async function loadMoviesByIdsFromDatabase(movieIds: string[]) {
  const uniqueMovieIds = [...new Set(movieIds)].filter(Boolean);
  if (uniqueMovieIds.length === 0 || !shouldAttemptDatabaseRead()) {
    return new Map<string, Movie>();
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.movieRecord.findMany({
      where: { id: { in: uniqueMovieIds } },
      select: { data: true }
    });
    markDatabaseReadHealthy();
    return new Map(mapMovieRecordsToStateMovies(rows).map((movie) => [movie.id, movie]));
  } catch (error) {
    markDatabaseReadFailure("movies by id read", error);
    return new Map<string, Movie>();
  }
}

async function loadMovieBySlugFromDatabase(slug: string) {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.movieRecord.findUnique({
      where: { slug },
      select: { data: true }
    });
    markDatabaseReadHealthy();
    return row && isMovie(row.data) ? row.data : null;
  } catch (error) {
    markDatabaseReadFailure("movie by slug read", error);
    return null;
  }
}

async function loadSnapshotStateUncached(client?: Prisma.TransactionClient) {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const prisma = client ?? (await import("@/lib/prisma")).prisma;
    const snapshot = await prisma.appSnapshot.findUnique({
      where: {
        id: SNAPSHOT_ID
      }
    });

    if (!snapshot) {
      markDatabaseReadHealthy();
      return null;
    }

    const parsed = isAppState(snapshot.data) ? ensureStateIntegrity(snapshot.data) : null;
    if (!parsed) {
      throw new Error("El snapshot guardado tiene un formato inválido.");
    }
    markDatabaseReadHealthy();

    return parsed;
  } catch (error) {
    if (client) throw error;
    markDatabaseReadFailure("snapshot", error);
    return null;
  }
}

async function loadDatabaseStateUncached(client?: Prisma.TransactionClient) {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    if (!client) await ensurePreviewDataHygiene();
    const snapshotState = await loadSnapshotStateUncached(client);
    // A missing snapshot is not a failed query. Only use the configured group
    // context; all collections come from normalized tables, including empties.
    const baseState = snapshotState ?? { ...buildInitialState(), activity: [] };
    const normalizedCollections = await loadNormalizedStateCollections(baseState.group.id, client);
    markDatabaseReadHealthy();

    return ensureStateIntegrity(mergeNormalizedState(baseState, normalizedCollections));
  } catch (error) {
    if (client) throw error;
    markDatabaseReadFailure("normalized state read", error);
    return null;
  }
}

async function saveDatabaseState(state: AppState, database: Prisma.TransactionClient) {
  const compactState = toCompactSnapshotState(state);
  await database.appSnapshot.upsert({
    where: {
      id: SNAPSHOT_ID
    },
    create: {
      id: SNAPSHOT_ID,
      data: compactState
    },
    update: {
      data: compactState
    }
  });
}

async function loadAppStateUncached() {
  if (shouldUseDatabase()) {
    const databaseState = await loadDatabaseStateUncached();
    if (databaseState) {
      rememberLiveState(databaseState);
      return databaseState;
    }

    // Development may read a local fallback during an outage. Importing that
    // state into PostgreSQL is an explicit administrative operation.
    failClosedAfterDatabaseReadError();
    return loadFallbackState();
  }

  const localState = loadLocalStateFromDisk();
  if (localState) {
    return localState;
  }

  const initial = buildInitialState();
  rememberLiveState(initial);
  saveLocalStateToDisk(initial);
  return initial;
}

async function loadAppStateForRead() {
  const usesDatabase = shouldUseDatabase();
  const shouldUseMemoryCache = shouldUseProcessLocalMutableCache(usesDatabase);

  if (shouldUseMemoryCache) {
    const liveState = readTimedCache(liveStateMemoryCache);
    if (liveState) {
      return liveState;
    }
  }

  if (usesDatabase) {
    // A mutation and its following render can land on different Vercel
    // instances. Read the shared database once per request so an instance's
    // process-local cache can never keep the weekly selection stale.
    const databaseState = await loadDatabaseStateUncached();
    if (databaseState) {
      rememberLiveState(databaseState);
      return databaseState;
    }

    if (!shouldAttemptDatabaseRead()) {
      return loadFallbackState();
    }
  }

  return loadAppStateUncached();
}

const loadAppState = cache(loadAppStateForRead);

const runLocalMutation = createLocalMutationQueue();

async function mutateState<T>(action: (state: AppState, persist: PersistMutation) => Promise<T>): Promise<T> {
  const execute = async (client?: Prisma.TransactionClient) => {
    const loaded = client ? await loadDatabaseStateUncached(client) : await loadAppStateUncached();
    if (!loaded) throw new StatePersistenceUnavailableError("No se pudo cargar el estado para guardar los cambios.");
    const state = cloneState(loaded);
    let changed = false;
    const result = await action(state, async (nextState, operations) => {
      if (nextState !== state) throw new Error("La mutación intentó guardar un estado diferente.");
      if (client) {
        for (const operation of operations) await operation.run(client);
        await saveDatabaseState(state, client);
      } else {
        saveLocalStateToDiskStrict(state);
      }
      changed = true;
    });
    return { result, state, changed };
  };
  const publish = (committed: Awaited<ReturnType<typeof execute>>) => {
    if (committed.changed) {
      rememberLiveState(committed.state);
      if (shouldUseDatabase()) saveLocalStateToDisk(committed.state);
      invalidatePersistentStateCache();
    }
    return committed.result;
  };
  const usesDatabase = shouldUseDatabase();
  const run = async () => {
    let committed: Awaited<ReturnType<typeof execute>>;
    await commitStateChangeAtomically({
      usesDatabase,
      canWriteDatabase: shouldAttemptDatabaseWrite(),
      runDatabaseTransaction: async () => {
        await ensurePreviewDataHygiene();
        const { prisma } = await import("@/lib/prisma");
        // Read only after acquiring the shared lock; publish after COMMIT.
        committed = await withDatabaseMutation(prisma, execute);
        markDatabaseWriteHealthy();
      },
      writeLocalState: async () => { committed = await execute(); },
      publishCommittedState: () => { publish(committed); }
    });
    return committed!.result;
  };
  return usesDatabase ? run() : runLocalMutation(run);
}

function getDatabaseReadGroup() {
  return cloneState(loadFallbackState().group);
}

function addActivity(state: AppState, entry: ActivityItem) {
  const latestEntry = state.activity[0];
  if (latestEntry) {
    const latestTimestamp = new Date(latestEntry.date).getTime();
    const nextTimestamp = new Date(entry.date).getTime();
    const withinMergeWindow = Math.abs(nextTimestamp - latestTimestamp) <= 10 * 60 * 1000;
    const sameEvent =
      latestEntry.type === entry.type &&
      latestEntry.label === entry.label &&
      latestEntry.userId === entry.userId &&
      latestEntry.movieId === entry.movieId;

    if (sameEvent && withinMergeWindow) {
      latestEntry.date = entry.date;
      return;
    }
  }

  state.activity.unshift(entry);
  state.activity = state.activity.slice(0, 20);
}
