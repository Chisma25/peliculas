import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

import { cookies } from "next/headers";
import { cache } from "react";

import { seedState } from "@/lib/demo-data";
import { loadManualHistorySeed } from "@/lib/manual-history";
import { fetchUpcomingMovies, resolveMovieMetadata, searchMovies } from "@/lib/movie-provider";
import { generatePendingWeeklyOptions, generateWeeklyRecommendations, rankUpcomingReleasesForGroup } from "@/lib/recommendations";
import { getSessionCookieName as getSessionCookieNameFromSession, verifySessionToken } from "@/lib/session";
import {
  ActivityItem,
  AppState,
  Movie,
  RecommendationMetric,
  UpcomingReleaseSuggestion,
  User,
  UserRating,
  WatchEntry,
  WeeklyRecommendationBatch,
  WeeklyRecommendationItem
} from "@/lib/types";
import { average, safeId, slugify } from "@/lib/utils";
const DATA_DIR = join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIR, "runtime-state.json");
const WRITE_QUEUE_FILE = join(DATA_DIR, "runtime-write-queue.json");
const SNAPSHOT_ID = process.env.APP_SNAPSHOT_ID || "main";
const ADMIN_RESET_CODE = process.env.ADMIN_RESET_CODE?.trim() || "";
const STATE_CACHE_TTL_MS = 20_000;
const PAGE_ROUTE_CACHE_TTL_MS = 1000 * 60 * 2;
const MOVIE_DETAIL_CACHE_TTL_MS = 1000 * 60 * 2;
const UPCOMING_RELEASES_CACHE_TTL_MS = 1000 * 60 * 15;
const DATABASE_READ_BACKOFF_MS = 1000 * 60;
const DATABASE_WRITE_BACKOFF_MS = 1000 * 60;
const DATABASE_QUOTA_BACKOFF_MS = 1000 * 60 * 30;
const LIVE_STATE_CACHE_TTL_MS = 1000 * 60 * 10;
const DEFERRED_WRITE_FLUSH_TTL_MS = 1000 * 60;
const SNAPSHOT_BACKUP_INTERVAL_MS = 1000 * 60 * 5;
const APP_REGISTRATION_FALLBACK_DATE = "2026-03-14T17:09:52.000Z";

const REMOVED_TEST_USER_IDS = new Set(["user_xisma25"]);
const DEFAULT_ADMIN_IDS = new Set(["user_isma"]);
const DEFAULT_ADMIN_IDENTITIES = new Set(["isma"]);

type HistoryFilters = {
  genre?: string;
  year?: string;
  search?: string;
  sort?: "watched-desc" | "group-desc" | "group-asc" | "mine-desc" | "mine-asc";
};

type HistoryItem = {
  movie: Movie;
  watchedOn: string | undefined;
  groupAverage: number;
  ratings: UserRating[];
  userRating: number | undefined;
};

type ProfileData = {
  user: User;
  ratingsCount: number;
  averageScore: number;
  topThree: Array<UserRating & { movie: Movie }>;
  bottomThree: Array<UserRating & { movie: Movie }>;
  bestScore: number;
  distribution: Array<{
    value: number;
    label: string;
    count: number;
    ratio: number;
    axisLabel: string;
  }>;
};

type ProfileSummary = {
  ratingsCount: number;
  averageScore: number;
  bestScore: number;
};

type ProfileOverview = {
  topThree: Array<UserRating & { movie: Movie }>;
  bottomThree: Array<UserRating & { movie: Movie }>;
  distribution: ProfileData["distribution"];
};

type DashboardData = {
  selectedMovie: Movie | null;
  selectedWatchEntry: WatchEntry | null;
  recentActivity: ActivityItem[];
  upcomingReleases: UpcomingReleaseSuggestion[];
  stats: {
    watchedCount: number;
    averageScore: number;
    pendingCount: number;
  };
};

type DashboardOverviewData = Omit<DashboardData, "upcomingReleases">;
type ProfileDataCacheKey = string;
type MovieDetailCacheKey = string;
type PendingListCacheKey = string;
type ViewedListCacheKey = string;

type StateIndexes = {
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

type NormalizedCollections = {
  pendingMovieIds: string[];
  watchEntries: WatchEntry[];
  ratings: UserRating[];
  weeklyBatches: WeeklyRecommendationBatch[];
};

type PendingListBase = {
  batch: WeeklyRecommendationBatch | null;
  genres: string[];
  totalPendingCount: number;
  filteredPendingIds: string[];
  weeklyOptions: WeeklyRecommendationItem[];
};

type ViewedHistorySummary = {
  movieId: string;
  watchedOn: string | undefined;
  groupAverage: number;
  userRating: number | undefined;
};

type ViewedListBase = {
  genres: string[];
  totalHistoryCount: number;
  filteredHistory: ViewedHistorySummary[];
};

type TimedCache<T> = {
  value: T;
  expiresAt: number;
};

type DeferredDatabaseWrite =
  | {
      type: "user-upsert";
      user: User;
    }
  | {
      type: "movie-upsert";
      movie: Movie;
    }
  | {
      type: "pending-upsert";
      groupId: string;
      movieId: string;
      addedAt: string;
    }
  | {
      type: "pending-remove";
      groupId: string;
      movieId: string;
    }
  | {
      type: "watch-upsert";
      entry: WatchEntry;
    }
  | {
      type: "rating-upsert";
      rating: UserRating;
    }
  | {
      type: "weekly-batch-upsert";
      batch: WeeklyRecommendationBatch;
    }
  | {
      type: "weekly-batch-selection";
      batchId: string;
      selectedMovieId?: string;
    }
  | {
      type: "snapshot-backup";
      state: AppState;
    };

type DatabaseWriteOperation = {
  run: () => Promise<unknown>;
  deferred: DeferredDatabaseWrite;
};

type PersistStateChangeOptions = {
  snapshotStrategy?: "eager" | "deferred" | "skip";
};

const stateIndexesCache = new WeakMap<AppState, StateIndexes>();
const profileDataCache = new WeakMap<AppState, Map<string, ProfileData | null>>();
const profileSummaryCache = new WeakMap<AppState, Map<string, ProfileSummary>>();
const profileOverviewCache = new WeakMap<AppState, Map<string, ProfileOverview>>();
let snapshotMemoryCache: TimedCache<AppState | null> | null = null;
let snapshotUsersMemoryCache: TimedCache<User[]> | null = null;
let snapshotUsersWithAvatarsMemoryCache: TimedCache<User[]> | null = null;
let movieCatalogMemoryCache: TimedCache<Movie[]> | null = null;
const normalizedCollectionsCache = new Map<string, TimedCache<NormalizedCollections>>();
let dashboardDataMemoryCache: TimedCache<DashboardOverviewData> | null = null;
let upcomingReleasesMemoryCache: TimedCache<UpcomingReleaseSuggestion[]> | null = null;
let databaseReadBackoffUntil = 0;
let databaseWriteBackoffUntil = 0;
let liveStateMemoryCache: TimedCache<AppState> | null = null;
let lastSnapshotBackupAt = 0;
let lastDeferredWriteFlushAt = 0;
let groupPageDataMemoryCache: TimedCache<{
  group: AppState["group"];
  members: Array<{
    member: User;
    profileSummary: ProfileSummary;
  }>;
}> | null = null;
const profilePageDataMemoryCache = new Map<ProfileDataCacheKey, TimedCache<ProfileData | null>>();
const movieDetailDataMemoryCache = new Map<MovieDetailCacheKey, TimedCache<{
  movie: Movie;
  watchEntry: WatchEntry | null;
  ratings: UserRating[];
  members: User[];
  average: number;
  myRating: UserRating | null;
} | null>>();
const pendingListMemoryCache = new Map<PendingListCacheKey, TimedCache<PendingListBase>>();
const viewedListMemoryCache = new Map<ViewedListCacheKey, TimedCache<ViewedListBase>>();

function invalidateDerivedCaches(state: AppState) {
  stateIndexesCache.delete(state);
  profileDataCache.delete(state);
  profileSummaryCache.delete(state);
  profileOverviewCache.delete(state);
}

function cloneState<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function readTimedCache<T>(entry: TimedCache<T> | null | undefined) {
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }

  return cloneState(entry.value);
}

function writeTimedCache<T>(value: T): TimedCache<T> {
  return {
    value: cloneState(value),
    expiresAt: Date.now() + STATE_CACHE_TTL_MS
  };
}

function writeTimedCacheWithTtl<T>(value: T, ttlMs: number): TimedCache<T> {
  return {
    value: cloneState(value),
    expiresAt: Date.now() + ttlMs
  };
}

function invalidatePersistentStateCache() {
  snapshotMemoryCache = null;
  snapshotUsersMemoryCache = null;
  snapshotUsersWithAvatarsMemoryCache = null;
  movieCatalogMemoryCache = null;
  normalizedCollectionsCache.clear();
  dashboardDataMemoryCache = null;
  upcomingReleasesMemoryCache = null;
  groupPageDataMemoryCache = null;
  profilePageDataMemoryCache.clear();
  movieDetailDataMemoryCache.clear();
  pendingListMemoryCache.clear();
  viewedListMemoryCache.clear();
}

function normalizeUsername(value: string) {
  return slugify(value).replace(/-/g, "");
}

function normalizeIdentity(value: string) {
  return normalizeUsername(value.trim());
}

function secureStringMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) {
    return false;
  }

  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHash, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

function validateUsername(value: string) {
  if (value.length < 3 || value.length > 32) {
    throw new Error("El usuario debe tener entre 3 y 32 caracteres.");
  }
}

function validateDisplayName(value: string) {
  if (value.length < 2 || value.length > 60) {
    throw new Error("El nombre visible debe tener entre 2 y 60 caracteres.");
  }
}

function validatePassword(value: string) {
  if (value.length < 8 || value.length > 128) {
    throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");
  }
}

function sanitizeComment(value?: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length > 1000) {
    throw new Error("El comentario no puede superar los 1000 caracteres.");
  }

  return trimmed;
}

function sanitizeAvatarDataUrl(value?: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }

  const isAllowedImage = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(trimmed);
  if (!isAllowedImage) {
    throw new Error("El avatar debe ser una imagen PNG, JPG, WEBP o GIF.");
  }

  if (trimmed.length > 2_000_000) {
    throw new Error("El avatar es demasiado grande.");
  }

  return trimmed;
}

function ensureUserCredentials(user: User) {
  const username = user.username?.trim() || user.name || user.email.split("@")[0] || user.id;
  const passwordHash = typeof user.passwordHash === "string" ? user.passwordHash.trim() : "";
  return {
    ...user,
    username,
    avatarSeed: user.avatarSeed || slugify(user.name || username),
    // Legacy accounts without password hash stay blocked until an admin or emergency reset assigns one.
    passwordHash,
    isAdmin:
      Boolean(user.isAdmin) ||
      DEFAULT_ADMIN_IDS.has(user.id) ||
      DEFAULT_ADMIN_IDENTITIES.has(normalizeUsername(user.name)) ||
      DEFAULT_ADMIN_IDENTITIES.has(normalizeUsername(username))
  };
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
    state.watchEntries.map((entry) => movieAverageById.get(entry.movieId) ?? 0).filter((value) => value > 0)
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

async function loadSnapshotUsersCached() {
  return loadUsersForRead();
}

const loadSnapshotUsersForRequest = cache(async () => loadUsersForRead());

const USER_RECORD_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  avatarSeed: true,
  passwordHash: true,
  isAdmin: true
} as const;

const USER_RECORD_WITH_AVATAR_SELECT = {
  ...USER_RECORD_SELECT,
  avatarUrl: true
} as const;

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
  return Boolean(process.env.DATABASE_URL);
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
  return shouldUseDatabase() && Date.now() >= databaseReadBackoffUntil;
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
  console.error(`[store] Database read failed in ${scope}. Falling back to local state for reads.`, error);
}

function markDatabaseWriteFailure(scope: string, error: unknown) {
  const backoffMs = getBackoffDuration(error, DATABASE_WRITE_BACKOFF_MS);
  databaseWriteBackoffUntil = Date.now() + backoffMs;
  if (isDatabaseQuotaExceededError(error)) {
    databaseReadBackoffUntil = Math.max(databaseReadBackoffUntil, Date.now() + backoffMs);
  }
  console.error(`[store] Database write failed in ${scope}. Keeping local fallback state alive.`, error);
}

function loadLocalStateFromDisk() {
  try {
    if (!existsSync(STATE_FILE)) {
      return null;
    }

    const raw = readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isAppState(parsed)) {
      return null;
    }

    const state = ensureStateIntegrity(parsed);
    rememberLiveState(state);
    return state;
  } catch {
    return null;
  }
}

function saveLocalStateToDisk(state: AppState) {
  try {
    rememberLiveState(state);
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Persistencia local best-effort.
  }
}

function isDeferredDatabaseWrite(value: unknown): value is DeferredDatabaseWrite {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: string };
  return (
    candidate.type === "pending-upsert" ||
    candidate.type === "pending-remove" ||
    candidate.type === "watch-upsert" ||
    candidate.type === "rating-upsert" ||
    candidate.type === "weekly-batch-upsert" ||
    candidate.type === "weekly-batch-selection" ||
    candidate.type === "user-upsert" ||
    candidate.type === "movie-upsert" ||
    candidate.type === "snapshot-backup"
  );
}

function loadDeferredWriteQueue() {
  try {
    if (!existsSync(WRITE_QUEUE_FILE)) {
      return [];
    }

    const raw = readFileSync(WRITE_QUEUE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isDeferredDatabaseWrite);
  } catch {
    return [];
  }
}

function compactDeferredWriteQueue(queue: DeferredDatabaseWrite[]) {
  const latestSnapshotIndex = [...queue]
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.type === "snapshot-backup")
    .map(({ index }) => index)
    .pop();

  return queue.filter((entry, index) => entry.type !== "snapshot-backup" || index === latestSnapshotIndex);
}

function saveDeferredWriteQueue(queue: DeferredDatabaseWrite[]) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    writeFileSync(WRITE_QUEUE_FILE, JSON.stringify(compactDeferredWriteQueue(queue), null, 2), "utf8");
  } catch {
    // Persistencia local best-effort.
  }
}

function enqueueDeferredWrites(writes: DeferredDatabaseWrite[]) {
  if (writes.length === 0) {
    return;
  }

  const currentQueue = loadDeferredWriteQueue();
  saveDeferredWriteQueue([...currentQueue, ...writes]);
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

function toCompactSnapshotState(state: AppState): AppState {
  return {
    ...state,
    ratings: [],
    watchEntries: [],
    pendingMovieIds: [],
    weeklyBatches: []
  };
}

function parseWatchDate(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapWatchRecordsToStateEntries(records: Array<{
  id: string;
  movieId: string;
  groupId: string;
  watchedOn: Date | null;
  selectedForWeek: string | null;
}>): WatchEntry[] {
  return records.map((entry) => ({
    id: entry.id,
    movieId: entry.movieId,
    groupId: entry.groupId,
    watchedOn: entry.watchedOn?.toISOString(),
    selectedForWeek: entry.selectedForWeek ?? undefined
  }));
}

function mapRatingRecordsToStateEntries(records: Array<{
  id: string;
  movieId: string;
  userId: string;
  score: number;
  comment: string | null;
  watchedOn: Date | null;
}>): UserRating[] {
  return records.map((entry) => ({
    id: entry.id,
    movieId: entry.movieId,
    userId: entry.userId,
    score: entry.score,
    comment: entry.comment ?? undefined,
    watchedOn: entry.watchedOn?.toISOString()
  }));
}

function mapUserRecordsToStateUsers(records: Array<{
  id: string;
  name: string;
  username: string;
  email: string;
  avatarSeed: string | null;
  avatarUrl?: string | null;
  passwordHash: string;
  isAdmin: boolean;
}>): User[] {
  return records.map((entry) => {
    const user: User = {
      id: entry.id,
      name: entry.name,
      username: entry.username,
      email: entry.email,
      avatarSeed: entry.avatarSeed ?? slugify(entry.name || entry.username),
      passwordHash: entry.passwordHash,
      isAdmin: entry.isAdmin
    };

    if (entry.avatarUrl) {
      user.avatarUrl = entry.avatarUrl;
    }

    return ensureUserCredentials(user);
  });
}

function isMovie(value: unknown): value is Movie {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Movie>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.slug === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.year === "number" &&
    Array.isArray(candidate.genres) &&
    Array.isArray(candidate.cast) &&
    typeof candidate.externalRating === "object"
  );
}

function mapMovieRecordsToStateMovies(records: Array<{ data: unknown }>): Movie[] {
  return records.map((entry) => entry.data).filter(isMovie);
}

function mapWeeklyBatchRecordsToStateEntries(
  records: Array<{
    id: string;
    groupId: string;
    weekOf: Date;
    createdAt: Date;
    selectedMovieId: string | null;
    items: Array<{
      id: string;
      movieId: string;
      score: number;
      summary: string;
      reasons: unknown;
      metrics: unknown;
      position: number;
    }>;
  }>
): WeeklyRecommendationBatch[] {
  return records.map((batch) => ({
    id: batch.id,
    groupId: batch.groupId,
    weekOf: batch.weekOf.toISOString(),
    createdAt: batch.createdAt.toISOString(),
    selectedMovieId: batch.selectedMovieId ?? undefined,
    items: [...batch.items]
      .sort((left, right) => left.position - right.position)
      .map((item) => ({
        id: item.id,
        movieId: item.movieId,
        score: item.score,
        summary: item.summary,
        reasons: Array.isArray(item.reasons) ? (item.reasons as WeeklyRecommendationItem["reasons"]) : [],
        metrics: Array.isArray(item.metrics) ? (item.metrics as RecommendationMetric[]) : undefined
      }))
  }));
}

async function backfillNormalizedCollectionsFromSnapshot(state: AppState) {
  const { prisma } = await import("@/lib/prisma");
  const [userCount, movieCount, pendingCount, watchCount, ratingsCount, batchCount] = await Promise.all([
    prisma.userRecord.count(),
    prisma.movieRecord.count(),
    prisma.pendingMovie.count({ where: { groupId: state.group.id } }),
    prisma.watchEntryRecord.count({ where: { groupId: state.group.id } }),
    prisma.ratingRecord.count(),
    prisma.weeklyBatchRecord.count({ where: { groupId: state.group.id } })
  ]);

  const operations: Promise<unknown>[] = [];

  if (userCount === 0 && state.users.length > 0) {
    operations.push(syncUsersToDatabase(state.users));
  }

  if (movieCount === 0 && state.movies.length > 0) {
    operations.push(syncMoviesToDatabase(state.movies));
  }

  if (pendingCount === 0 && state.pendingMovieIds.length > 0) {
    operations.push(
      prisma.pendingMovie.createMany({
        data: state.pendingMovieIds.map((movieId, index) => ({
          groupId: state.group.id,
          movieId,
          addedAt: new Date(Date.now() - index * 1000)
        })),
        skipDuplicates: true
      })
    );
  }

  if (watchCount === 0 && state.watchEntries.length > 0) {
    operations.push(
      prisma.watchEntryRecord.createMany({
        data: state.watchEntries.map((entry, index) => ({
          id: entry.id,
          movieId: entry.movieId,
          groupId: entry.groupId,
          watchedOn: parseWatchDate(entry.watchedOn),
          selectedForWeek: entry.selectedForWeek,
          createdAt: parseWatchDate(entry.watchedOn) ?? new Date(Date.now() - index * 1000)
        })),
        skipDuplicates: true
      })
    );
  }

  if (ratingsCount === 0 && state.ratings.length > 0) {
    operations.push(
      prisma.ratingRecord.createMany({
        data: state.ratings.map((rating, index) => ({
          id: rating.id,
          movieId: rating.movieId,
          userId: rating.userId,
          score: rating.score,
          comment: rating.comment,
          watchedOn: parseWatchDate(rating.watchedOn),
          createdAt: parseWatchDate(rating.watchedOn) ?? new Date(Date.now() - index * 1000)
        })),
        skipDuplicates: true
      })
    );
  }

  if (batchCount === 0 && state.weeklyBatches.length > 0) {
    operations.push(
      prisma.$transaction([
        prisma.weeklyBatchRecord.createMany({
          data: state.weeklyBatches.map((batch) => ({
            id: batch.id,
            groupId: batch.groupId,
            weekOf: new Date(batch.weekOf),
            createdAt: new Date(batch.createdAt),
            selectedMovieId: batch.selectedMovieId ?? null
          })),
          skipDuplicates: true
        }),
        prisma.weeklyBatchItemRecord.createMany({
          data: state.weeklyBatches.flatMap((batch) =>
            batch.items.map((item, index) => ({
              id: item.id,
              batchId: batch.id,
              movieId: item.movieId,
              position: index,
              score: item.score,
              summary: item.summary,
              reasons: item.reasons,
              metrics: item.metrics ?? []
            }))
          ),
          skipDuplicates: true
        })
      ])
    );
  }

  if (operations.length > 0) {
    await Promise.all(operations);
  }
}

async function loadNormalizedCollections(groupId: string) {
  const { prisma } = await import("@/lib/prisma");
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

async function loadUsersFromDatabaseUncached(options: { includeAvatarUrls?: boolean } = {}): Promise<User[] | null> {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.userRecord.findMany({
      select: options.includeAvatarUrls ? USER_RECORD_WITH_AVATAR_SELECT : USER_RECORD_SELECT,
      orderBy: { name: "asc" }
    });
    markDatabaseReadHealthy();
    return rows.length > 0 ? mapUserRecordsToStateUsers(rows) : null;
  } catch (error) {
    markDatabaseReadFailure("users read", error);
    return null;
  }
}

async function loadUsersForRead(options: { includeAvatarUrls?: boolean } = {}): Promise<User[]> {
  const includeAvatarUrls = Boolean(options.includeAvatarUrls);
  const cacheRef = includeAvatarUrls ? snapshotUsersWithAvatarsMemoryCache : snapshotUsersMemoryCache;
  const cached = readTimedCache(cacheRef);
  if (cached) {
    return cached;
  }

  if (shouldUseDatabase()) {
    const databaseUsers = await loadUsersFromDatabaseUncached({ includeAvatarUrls });
    if (databaseUsers) {
      if (includeAvatarUrls) {
        snapshotUsersWithAvatarsMemoryCache = writeTimedCacheWithTtl(databaseUsers, PAGE_ROUTE_CACHE_TTL_MS);
      } else {
        snapshotUsersMemoryCache = writeTimedCacheWithTtl(databaseUsers, PAGE_ROUTE_CACHE_TTL_MS);
      }
      return cloneState(databaseUsers);
    }
  }

  const snapshot = await loadSnapshotStateUncached();
  const sourceUsers = snapshot?.users ?? loadFallbackState().users;
  const users: User[] = cloneState(
    includeAvatarUrls
      ? sourceUsers
      : sourceUsers.map((user) => {
          const { avatarUrl: _avatarUrl, ...userWithoutAvatar } = user;
          return {
            ...userWithoutAvatar,
            avatarUrl: undefined
          };
        })
  );
  if (includeAvatarUrls) {
    snapshotUsersWithAvatarsMemoryCache = writeTimedCacheWithTtl(users, PAGE_ROUTE_CACHE_TTL_MS);
  } else {
    snapshotUsersMemoryCache = writeTimedCacheWithTtl(users, PAGE_ROUTE_CACHE_TTL_MS);
  }

  if (shouldAttemptDatabaseWrite() && users.length > 0) {
    await syncUsersToDatabase(users).catch((error) => markDatabaseWriteFailure("users backfill", error));
  }

  return users;
}

async function syncUsersToDatabase(users: User[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction(
    users.map((user) =>
      prisma.userRecord.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          avatarSeed: user.avatarSeed ?? null,
          avatarUrl: user.avatarUrl ?? null,
          passwordHash: user.passwordHash,
          isAdmin: Boolean(user.isAdmin)
        },
        update: {
          name: user.name,
          username: user.username,
          email: user.email,
          avatarSeed: user.avatarSeed ?? null,
          avatarUrl: user.avatarUrl ?? null,
          passwordHash: user.passwordHash,
          isAdmin: Boolean(user.isAdmin)
        }
      })
    )
  );
}

async function upsertUserToDatabase(user: User) {
  await syncUsersToDatabase([user]);
}

async function loadMovieCatalogFromDatabaseUncached() {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.movieRecord.findMany({
      orderBy: [{ slug: "asc" }],
      select: { data: true }
    });
    markDatabaseReadHealthy();
    return rows.length > 0 ? mapMovieRecordsToStateMovies(rows) : null;
  } catch (error) {
    markDatabaseReadFailure("movie catalog read", error);
    return null;
  }
}

async function loadMovieCatalogForRead() {
  const cached = readTimedCache(movieCatalogMemoryCache);
  if (cached) {
    return cached;
  }

  if (shouldUseDatabase()) {
    const databaseMovies = await loadMovieCatalogFromDatabaseUncached();
    if (databaseMovies) {
      movieCatalogMemoryCache = writeTimedCacheWithTtl(databaseMovies, PAGE_ROUTE_CACHE_TTL_MS);
      return cloneState(databaseMovies);
    }
  }

  const movies = cloneState(loadFallbackState().movies);
  movieCatalogMemoryCache = writeTimedCacheWithTtl(movies, PAGE_ROUTE_CACHE_TTL_MS);
  return movies;
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

async function syncMoviesToDatabase(movies: Movie[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction(
    movies.map((movie) =>
      prisma.movieRecord.upsert({
        where: { id: movie.id },
        create: {
          id: movie.id,
          slug: movie.slug,
          data: movie
        },
        update: {
          slug: movie.slug,
          data: movie
        }
      })
    )
  );
}

async function upsertMovieToDatabase(movie: Movie) {
  await syncMoviesToDatabase([movie]);
}

async function syncPendingMoviesToDatabase(groupId: string, pendingMovieIds: string[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction([
    prisma.pendingMovie.deleteMany({ where: { groupId } }),
    ...(pendingMovieIds.length > 0
      ? [
          prisma.pendingMovie.createMany({
            data: pendingMovieIds.map((movieId, index) => ({
              groupId,
              movieId,
              addedAt: new Date(Date.now() - index * 1000)
            })),
            skipDuplicates: true
          })
        ]
      : [])
  ]);
}

async function syncWatchEntriesToDatabase(groupId: string, watchEntries: WatchEntry[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction([
    prisma.watchEntryRecord.deleteMany({ where: { groupId } }),
    ...(watchEntries.length > 0
      ? [
          prisma.watchEntryRecord.createMany({
            data: watchEntries.map((entry, index) => ({
              id: entry.id,
              movieId: entry.movieId,
              groupId: entry.groupId,
              watchedOn: parseWatchDate(entry.watchedOn),
              selectedForWeek: entry.selectedForWeek,
              createdAt: parseWatchDate(entry.watchedOn) ?? new Date(Date.now() - index * 1000)
            })),
            skipDuplicates: true
          })
        ]
      : [])
  ]);
}

async function syncRatingsToDatabase(ratings: UserRating[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction([
    prisma.ratingRecord.deleteMany(),
    ...(ratings.length > 0
      ? [
          prisma.ratingRecord.createMany({
            data: ratings.map((rating, index) => ({
              id: rating.id,
              movieId: rating.movieId,
              userId: rating.userId,
              score: rating.score,
              comment: rating.comment,
              watchedOn: parseWatchDate(rating.watchedOn),
              createdAt: parseWatchDate(rating.watchedOn) ?? new Date(Date.now() - index * 1000)
            })),
            skipDuplicates: true
          })
        ]
      : [])
  ]);
}

async function syncWeeklyBatchesToDatabase(groupId: string, weeklyBatches: WeeklyRecommendationBatch[]) {
  const { prisma } = await import("@/lib/prisma");
  const existingBatchIds = (
    await prisma.weeklyBatchRecord.findMany({
      where: { groupId },
      select: { id: true }
    })
  ).map((batch) => batch.id);

  await prisma.$transaction([
    ...(existingBatchIds.length > 0
      ? [prisma.weeklyBatchItemRecord.deleteMany({ where: { batchId: { in: existingBatchIds } } })]
      : []),
    prisma.weeklyBatchRecord.deleteMany({ where: { groupId } }),
    ...(weeklyBatches.length > 0
      ? [
          prisma.weeklyBatchRecord.createMany({
            data: weeklyBatches.map((batch) => ({
              id: batch.id,
              groupId: batch.groupId,
              weekOf: new Date(batch.weekOf),
              createdAt: new Date(batch.createdAt),
              selectedMovieId: batch.selectedMovieId ?? null
            })),
            skipDuplicates: true
          }),
          prisma.weeklyBatchItemRecord.createMany({
            data: weeklyBatches.flatMap((batch) =>
              batch.items.map((item, index) => ({
                id: item.id,
                batchId: batch.id,
                movieId: item.movieId,
                position: index,
                score: item.score,
                summary: item.summary,
                reasons: item.reasons,
                metrics: item.metrics ?? []
              }))
            ),
            skipDuplicates: true
          })
        ]
      : [])
  ]);
}

async function upsertPendingMovieToDatabase(groupId: string, movieId: string, addedAt = new Date()) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.pendingMovie.upsert({
    where: {
      groupId_movieId: {
        groupId,
        movieId
      }
    },
    create: {
      groupId,
      movieId,
      addedAt
    },
    update: {
      addedAt
    }
  });
}

async function removePendingMovieFromDatabase(groupId: string, movieId: string) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.pendingMovie.deleteMany({
    where: {
      groupId,
      movieId
    }
  });
}

async function upsertWatchEntryToDatabase(entry: WatchEntry) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.watchEntryRecord.upsert({
    where: {
      id: entry.id
    },
    create: {
      id: entry.id,
      movieId: entry.movieId,
      groupId: entry.groupId,
      watchedOn: parseWatchDate(entry.watchedOn),
      selectedForWeek: entry.selectedForWeek ?? null,
      createdAt: parseWatchDate(entry.watchedOn) ?? new Date()
    },
    update: {
      movieId: entry.movieId,
      groupId: entry.groupId,
      watchedOn: parseWatchDate(entry.watchedOn),
      selectedForWeek: entry.selectedForWeek ?? null
    }
  });
}

async function upsertRatingToDatabase(rating: UserRating) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.ratingRecord.upsert({
    where: {
      movieId_userId: {
        movieId: rating.movieId,
        userId: rating.userId
      }
    },
    create: {
      id: rating.id,
      movieId: rating.movieId,
      userId: rating.userId,
      score: rating.score,
      comment: rating.comment,
      watchedOn: parseWatchDate(rating.watchedOn),
      createdAt: parseWatchDate(rating.watchedOn) ?? new Date()
    },
    update: {
      id: rating.id,
      score: rating.score,
      comment: rating.comment,
      watchedOn: parseWatchDate(rating.watchedOn)
    }
  });
}

async function insertWeeklyBatchToDatabase(batch: WeeklyRecommendationBatch) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction([
    prisma.weeklyBatchRecord.upsert({
      where: {
        id: batch.id
      },
      create: {
        id: batch.id,
        groupId: batch.groupId,
        weekOf: new Date(batch.weekOf),
        createdAt: new Date(batch.createdAt),
        selectedMovieId: batch.selectedMovieId ?? null
      },
      update: {
        weekOf: new Date(batch.weekOf),
        selectedMovieId: batch.selectedMovieId ?? null
      }
    }),
    prisma.weeklyBatchItemRecord.deleteMany({
      where: {
        batchId: batch.id
      }
    }),
    prisma.weeklyBatchItemRecord.createMany({
      data: batch.items.map((item, index) => ({
        id: item.id,
        batchId: batch.id,
        movieId: item.movieId,
        position: index,
        score: item.score,
        summary: item.summary,
        reasons: item.reasons,
        metrics: item.metrics ?? []
      })),
      skipDuplicates: true
    })
  ]);
}

async function updateWeeklyBatchSelectionInDatabase(batchId: string, selectedMovieId?: string) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.weeklyBatchRecord.update({
    where: {
      id: batchId
    },
    data: {
      selectedMovieId: selectedMovieId ?? null
    }
  });
}

async function applyDeferredDatabaseWrite(write: DeferredDatabaseWrite) {
  switch (write.type) {
    case "user-upsert":
      await upsertUserToDatabase(write.user);
      return;
    case "movie-upsert":
      await upsertMovieToDatabase(write.movie);
      return;
    case "pending-upsert":
      await upsertPendingMovieToDatabase(write.groupId, write.movieId, new Date(write.addedAt));
      return;
    case "pending-remove":
      await removePendingMovieFromDatabase(write.groupId, write.movieId);
      return;
    case "watch-upsert":
      await upsertWatchEntryToDatabase(write.entry);
      return;
    case "rating-upsert":
      await upsertRatingToDatabase(write.rating);
      return;
    case "weekly-batch-upsert":
      await insertWeeklyBatchToDatabase(write.batch);
      return;
    case "weekly-batch-selection":
      await updateWeeklyBatchSelectionInDatabase(write.batchId, write.selectedMovieId);
      return;
    case "snapshot-backup":
      await saveDatabaseState(write.state);
      lastSnapshotBackupAt = Date.now();
      return;
  }
}

async function flushDeferredDatabaseWrites() {
  if (!shouldAttemptDatabaseWrite()) {
    return false;
  }

  if (Date.now() - lastDeferredWriteFlushAt < DEFERRED_WRITE_FLUSH_TTL_MS) {
    return true;
  }

  const queue = loadDeferredWriteQueue();
  if (queue.length === 0) {
    lastDeferredWriteFlushAt = Date.now();
    return true;
  }

  lastDeferredWriteFlushAt = Date.now();

  for (let index = 0; index < queue.length; index += 1) {
    try {
      await applyDeferredDatabaseWrite(queue[index]);
    } catch (error) {
      saveDeferredWriteQueue(queue.slice(index));
      markDatabaseWriteFailure("deferred write flush", error);
      return false;
    }
  }

  saveDeferredWriteQueue([]);
  markDatabaseWriteHealthy();
  return true;
}

async function loadSnapshotStateUncached() {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
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
    markDatabaseReadHealthy();
    if (!parsed) {
      return null;
    }

    return parsed;
  } catch (error) {
    markDatabaseReadFailure("snapshot", error);
    return null;
  }
}

async function loadSnapshotStateCached() {
  const cached = readTimedCache(snapshotMemoryCache);
  if (cached) {
    return cached;
  }

  const snapshot = await loadSnapshotStateUncached();
  snapshotMemoryCache = writeTimedCache(snapshot);
  return snapshot ? cloneState(snapshot) : null;
}

const loadSnapshotStateForRequest = cache(async () => loadSnapshotStateCached());

async function loadNormalizedCollectionsCached(groupId: string) {
  const cached = readTimedCache(normalizedCollectionsCache.get(groupId));
  if (cached) {
    return cached;
  }

  const collections = await loadNormalizedCollections(groupId);
  normalizedCollectionsCache.set(groupId, writeTimedCache(collections));
  return cloneState(collections);
}

async function loadDatabaseStateUncached() {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const parsed = await loadSnapshotStateUncached();
    if (!parsed) {
      return null;
    }

    await backfillNormalizedCollectionsFromSnapshot(parsed);
    const normalizedCollections = await loadNormalizedCollections(parsed.group.id);
    markDatabaseReadHealthy();

    return ensureStateIntegrity({
      ...parsed,
      ratings:
        normalizedCollections.ratings.length > 0 || parsed.ratings.length === 0
          ? normalizedCollections.ratings
          : parsed.ratings,
      pendingMovieIds:
        normalizedCollections.pendingMovieIds.length > 0 || parsed.pendingMovieIds.length === 0
          ? normalizedCollections.pendingMovieIds
          : parsed.pendingMovieIds,
      watchEntries:
        normalizedCollections.watchEntries.length > 0 || parsed.watchEntries.length === 0
          ? normalizedCollections.watchEntries
          : parsed.watchEntries,
      weeklyBatches:
        normalizedCollections.weeklyBatches.length > 0 || parsed.weeklyBatches.length === 0
          ? normalizedCollections.weeklyBatches
          : parsed.weeklyBatches
    });
  } catch (error) {
    markDatabaseReadFailure("normalized collections bootstrap", error);
    return null;
  }
}

async function loadDatabaseState() {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const snapshotState = await loadSnapshotStateForRequest();
    if (!snapshotState) {
      return null;
    }

    const normalizedCollections = await loadNormalizedCollectionsCached(snapshotState.group.id);
    markDatabaseReadHealthy();

    return ensureStateIntegrity({
      ...cloneState(snapshotState),
      ratings:
        normalizedCollections.ratings.length > 0 || snapshotState.ratings.length === 0
          ? normalizedCollections.ratings
          : snapshotState.ratings,
      pendingMovieIds:
        normalizedCollections.pendingMovieIds.length > 0 || snapshotState.pendingMovieIds.length === 0
          ? normalizedCollections.pendingMovieIds
          : snapshotState.pendingMovieIds,
      watchEntries:
        normalizedCollections.watchEntries.length > 0 || snapshotState.watchEntries.length === 0
          ? normalizedCollections.watchEntries
          : snapshotState.watchEntries,
      weeklyBatches:
        normalizedCollections.weeklyBatches.length > 0 || snapshotState.weeklyBatches.length === 0
          ? normalizedCollections.weeklyBatches
          : snapshotState.weeklyBatches
    });
  } catch (error) {
    markDatabaseReadFailure("normalized collections read", error);
    return null;
  }
}

async function saveDatabaseState(state: AppState) {
  const { prisma } = await import("@/lib/prisma");
  const compactState = toCompactSnapshotState(state);
  await prisma.appSnapshot.upsert({
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

    if (!shouldAttemptDatabaseRead()) {
      return loadFallbackState();
    }

    const initial = loadFallbackState();

    try {
      await Promise.all([
        syncRatingsToDatabase(initial.ratings),
        syncPendingMoviesToDatabase(initial.group.id, initial.pendingMovieIds),
        syncWatchEntriesToDatabase(initial.group.id, initial.watchEntries),
        syncWeeklyBatchesToDatabase(initial.group.id, initial.weeklyBatches)
      ]);
      await saveDatabaseState(initial);
      lastSnapshotBackupAt = Date.now();
      invalidatePersistentStateCache();
      markDatabaseReadHealthy();
      markDatabaseWriteHealthy();
      rememberLiveState(initial);
      return initial;
    } catch (error) {
      markDatabaseReadFailure("database bootstrap", error);
      markDatabaseWriteFailure("database bootstrap", error);
      return initial;
    }
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
  const liveState = readTimedCache(liveStateMemoryCache);
  if (liveState) {
    return liveState;
  }

  if (shouldAttemptDatabaseWrite()) {
    await flushDeferredDatabaseWrites();
  }

  if (shouldUseDatabase()) {
    const databaseState = await loadDatabaseState();
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

function createSnapshotBackupWrite(state: AppState): DeferredDatabaseWrite {
  return {
    type: "snapshot-backup",
    state: toCompactSnapshotState(state)
  };
}

async function persistStateChange(
  state: AppState,
  operations: DatabaseWriteOperation[] = [],
  options: PersistStateChangeOptions = {}
) {
  const snapshotStrategy = options.snapshotStrategy ?? (operations.length > 0 ? "deferred" : "eager");
  const snapshotEnabled = snapshotStrategy !== "skip";
  const shouldSnapshotNow =
    snapshotStrategy === "eager" ||
    (snapshotStrategy === "deferred" && Date.now() - lastSnapshotBackupAt >= SNAPSHOT_BACKUP_INTERVAL_MS);
  const deferredWrites = [
    ...operations.map((operation) => operation.deferred),
    ...(snapshotEnabled && shouldSnapshotNow ? [createSnapshotBackupWrite(state)] : [])
  ];

  rememberLiveState(state);
  saveLocalStateToDisk(state);
  invalidatePersistentStateCache();

  if (!shouldAttemptDatabaseWrite()) {
    enqueueDeferredWrites(deferredWrites);
    return;
  }

  const flushed = await flushDeferredDatabaseWrites();
  if (!flushed) {
    enqueueDeferredWrites(deferredWrites);
    return;
  }

  try {
    await Promise.all(operations.map((operation) => operation.run()));
    if (snapshotEnabled && shouldSnapshotNow) {
      await saveDatabaseState(state);
      lastSnapshotBackupAt = Date.now();
    }
    markDatabaseWriteHealthy();
  } catch (error) {
    enqueueDeferredWrites(deferredWrites);
    markDatabaseWriteFailure("state mutation", error);
  }
}

async function persistPendingStateChangeStrict(state: AppState, operations: DatabaseWriteOperation[]) {
  rememberLiveState(state);
  saveLocalStateToDisk(state);
  invalidatePersistentStateCache();

  if (!shouldAttemptDatabaseWrite()) {
    throw new Error("Database writes are temporarily unavailable.");
  }

  const flushed = await flushDeferredDatabaseWrites();
  if (!flushed) {
    throw new Error("Deferred database writes could not be flushed.");
  }

  try {
    for (const operation of operations) {
      await operation.run();
    }
    markDatabaseWriteHealthy();
  } catch (error) {
    enqueueDeferredWrites(operations.map((operation) => operation.deferred));
    markDatabaseWriteFailure("pending movie mutation", error);
    throw error;
  }
}

function findUserById(state: AppState, userId?: string | null) {
  if (!userId) {
    return null;
  }

  return getStateIndexes(state).usersById.get(userId) ?? null;
}

function findUserByUsername(state: AppState, username?: string | null) {
  const normalizedUsername = normalizeUsername(username ?? "");
  return getStateIndexes(state).usersByUsername.get(normalizedUsername) ?? null;
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

function isDashboardBatchValid(state: AppState, batch: AppState["weeklyBatches"][number] | null) {
  if (!batch || batch.items.length !== 3) {
    return false;
  }

  const { watchedMovieIdSet, pendingMovieIdSet } = getStateIndexes(state);

  return batch.items.every((item) => {
    const movie = getMovieById(state, item.movieId);
    return (
      Boolean(movie) &&
      !watchedMovieIdSet.has(item.movieId) &&
      !pendingMovieIdSet.has(item.movieId) &&
      Array.isArray(item.metrics) &&
      item.metrics.length >= 4
    );
  });
}

async function ensureDashboardBatch(state: AppState) {
  const currentBatch = getCurrentBatchFromState(state);
  if (isDashboardBatchValid(state, currentBatch)) {
    return {
      batch: currentBatch,
      changed: false
    };
  }

  const refreshedBatch = generateWeeklyRecommendations(state);
  if (currentBatch?.selectedMovieId) {
    refreshedBatch.selectedMovieId = currentBatch.selectedMovieId;
  }

  state.weeklyBatches.unshift(refreshedBatch);
  invalidateDerivedCaches(state);
  return {
    batch: refreshedBatch,
    changed: true
  };
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

function getProfileSummaryFromState(state: AppState, userId: string): ProfileSummary {
  const cachedSummaries = profileSummaryCache.get(state);
  const cachedSummary = cachedSummaries?.get(userId);
  if (cachedSummary) {
    return cachedSummary;
  }

  const userRatings = getStateIndexes(state).ratingsByUserId.get(userId) ?? [];
  const summary = {
    ratingsCount: userRatings.length,
    averageScore: average(userRatings.map((rating) => rating.score)),
    bestScore: userRatings.reduce((best, rating) => Math.max(best, rating.score), 0)
  };

  const nextSummaries = cachedSummaries ?? new Map<string, ProfileSummary>();
  nextSummaries.set(userId, summary);
  profileSummaryCache.set(state, nextSummaries);

  return summary;
}

function getProfileOverviewFromState(state: AppState, userId: string): ProfileOverview {
  const cachedOverviews = profileOverviewCache.get(state);
  const cachedOverview = cachedOverviews?.get(userId);
  if (cachedOverview) {
    return cachedOverview;
  }

  const indexes = getStateIndexes(state);
  const ratedMovies = (indexes.ratingsByUserId.get(userId) ?? [])
    .map((rating) => ({
      ...rating,
      movie: indexes.moviesById.get(rating.movieId)
    }))
    .filter((rating): rating is UserRating & { movie: Movie } => Boolean(rating.movie));

  const topThree = [...ratedMovies].sort((left, right) => right.score - left.score || right.movie.year - left.movie.year).slice(0, 3);
  const bottomThree = [...ratedMovies].sort((left, right) => left.score - right.score || right.movie.year - left.movie.year).slice(0, 3);

  const distributionStep = 0.5;
  const distributionBins = Array.from({ length: Math.floor(10 / distributionStep) + 1 }, (_, index) => ({
    value: Number((index * distributionStep).toFixed(1)),
    label: (index * distributionStep).toFixed(1),
    count: 0
  }));

  for (const rating of ratedMovies) {
    const bucket = Math.max(0, Math.min(distributionBins.length - 1, Math.round(rating.score / distributionStep)));
    distributionBins[bucket].count += 1;
  }

  const maxDistributionCount = Math.max(...distributionBins.map((item) => item.count), 1);
  const overview = {
    topThree,
    bottomThree,
    distribution: distributionBins.map((item, index) => ({
      ...item,
      ratio: item.count / maxDistributionCount,
      axisLabel: index % 2 === 0 ? item.label : ""
    }))
  };

  const nextOverviews = cachedOverviews ?? new Map<string, ProfileOverview>();
  nextOverviews.set(userId, overview);
  profileOverviewCache.set(state, nextOverviews);

  return overview;
}

function getGroupStatsFromState(state: AppState) {
  const { groupAverageScore } = getStateIndexes(state);
  return {
    watchedCount: state.watchEntries.length,
    averageScore: groupAverageScore,
    pendingCount: state.pendingMovieIds.length
  };
}

function buildDashboardDataFromState(state: AppState): DashboardOverviewData {
  const batch = getCurrentBatchFromState(state);
  const selectedMovie = batch?.selectedMovieId ? getMovieById(state, batch.selectedMovieId) : null;

  return {
    selectedMovie,
    selectedWatchEntry: batch?.selectedMovieId ? getWatchEntryForMovieFromState(state, batch.selectedMovieId) : null,
    recentActivity: state.activity.slice(0, 5),
    stats: getGroupStatsFromState(state)
  };
}

function getDatabaseReadGroup() {
  return cloneState(loadFallbackState().group);
}

function indexMoviesById(movies: Movie[]) {
  return new Map(movies.map((movie) => [movie.id, movie]));
}

function buildRatingDistribution(ratings: UserRating[]): ProfileOverview["distribution"] {
  const distributionStep = 0.5;
  const distributionBins = Array.from({ length: Math.floor(10 / distributionStep) + 1 }, (_, index) => ({
    value: Number((index * distributionStep).toFixed(1)),
    label: (index * distributionStep).toFixed(1),
    count: 0
  }));

  for (const rating of ratings) {
    const bucket = Math.max(0, Math.min(distributionBins.length - 1, Math.round(rating.score / distributionStep)));
    distributionBins[bucket].count += 1;
  }

  const maxDistributionCount = Math.max(...distributionBins.map((item) => item.count), 1);
  return distributionBins.map((item, index) => ({
    ...item,
    ratio: item.count / maxDistributionCount,
    axisLabel: index % 2 === 0 ? item.label : ""
  }));
}

function buildProfileFromRatings(user: User, ratings: UserRating[], moviesById: Map<string, Movie>): ProfileData {
  const ratedMovies = ratings
    .map((rating) => ({
      ...rating,
      movie: moviesById.get(rating.movieId)
    }))
    .filter((rating): rating is UserRating & { movie: Movie } => Boolean(rating.movie));
  const topThree = [...ratedMovies].sort((left, right) => right.score - left.score || right.movie.year - left.movie.year).slice(0, 3);
  const bottomThree = [...ratedMovies].sort((left, right) => left.score - right.score || right.movie.year - left.movie.year).slice(0, 3);

  return {
    user,
    ratingsCount: ratings.length,
    averageScore: average(ratings.map((rating) => rating.score)),
    topThree,
    bottomThree,
    bestScore: ratings.reduce((best, rating) => Math.max(best, rating.score), 0) || topThree[0]?.score || 0,
    distribution: buildRatingDistribution(ratings)
  };
}

async function hydrateMoviesForDatabaseRead(movies: Movie[]) {
  const changedMovies: Movie[] = [];
  const hydrationState = loadFallbackState();
  await Promise.all(
    movies.map(async (movie) => {
      const changed = await hydrateMovie(hydrationState, movie);
      if (changed) {
        changedMovies.push(movie);
      }
    })
  );

  if (changedMovies.length > 0 && shouldAttemptDatabaseWrite()) {
    await syncMoviesToDatabase(changedMovies).catch((error) => markDatabaseWriteFailure("movie hydration sync", error));
  }
}

function getRecentActivityForDatabaseRead() {
  return cloneState(loadFallbackState().activity.slice(0, 5));
}

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

async function loadDashboardDataFromDatabase(): Promise<DashboardOverviewData | null> {
  const cached = readTimedCache(dashboardDataMemoryCache);
  if (cached) {
    return cached;
  }

  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const groupId = getDatabaseReadGroup().id;

    const [pendingCount, watchedRows, latestBatch] = await Promise.all([
      prisma.pendingMovie.count({ where: { groupId } }),
      prisma.watchEntryRecord.findMany({
        where: { groupId },
        select: { movieId: true }
      }),
      prisma.weeklyBatchRecord.findFirst({
        where: { groupId },
        orderBy: { createdAt: "desc" },
        select: { selectedMovieId: true }
      })
    ]);

    const watchedMovieIds = watchedRows.map((entry) => entry.movieId);
    const [selectedWatchRecord, movieAverageRows] = await Promise.all([
      latestBatch?.selectedMovieId
        ? prisma.watchEntryRecord.findUnique({
            where: { movieId: latestBatch.selectedMovieId }
          })
        : Promise.resolve(null),
      watchedMovieIds.length > 0
        ? prisma.ratingRecord.groupBy({
            by: ["movieId"],
            where: { movieId: { in: watchedMovieIds } },
            _avg: { score: true }
          })
        : Promise.resolve([])
    ]);

    const averageScore = average(
      movieAverageRows
        .map((entry) => entry._avg.score ?? 0)
        .filter((value) => value > 0)
    );

    const selectedMovie = latestBatch?.selectedMovieId
      ? (await loadMoviesByIdsFromDatabase([latestBatch.selectedMovieId])).get(latestBatch.selectedMovieId) ?? null
      : null;
    const dashboardData = {
      selectedMovie,
      selectedWatchEntry: selectedWatchRecord ? mapWatchRecordsToStateEntries([selectedWatchRecord])[0] ?? null : null,
      recentActivity: getRecentActivityForDatabaseRead(),
      stats: {
        watchedCount: watchedRows.length,
        averageScore,
        pendingCount
      }
    } satisfies DashboardOverviewData;

    markDatabaseReadHealthy();
    dashboardDataMemoryCache = writeTimedCacheWithTtl(dashboardData, PAGE_ROUTE_CACHE_TTL_MS);
    return cloneState(dashboardData);
  } catch (error) {
    markDatabaseReadFailure("dashboard aggregate", error);
    return null;
  }
}

function listMembersFromState(state: AppState) {
  const { usersById } = getStateIndexes(state);
  return state.group.memberIds.map((memberId) => usersById.get(memberId)).filter((user): user is User => Boolean(user));
}

function listPendingFromState(state: AppState) {
  const { moviesById } = getStateIndexes(state);
  return state.pendingMovieIds.map((movieId) => moviesById.get(movieId)).filter((movie): movie is Movie => Boolean(movie));
}

function buildPendingListCacheKey(search: string, genre: string) {
  return `${search.toLocaleLowerCase("es")}::${genre.toLocaleLowerCase("es")}`;
}

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

function movieNeedsHydration(movie: Movie) {
  const hasGenres = movie.genres.length > 0 && !movie.genres.every((genre) => genre === "Pendiente");
  const hasDirector = movie.director && movie.director !== "Pendiente";
  const hasSynopsis = movie.synopsis && movie.synopsis !== "Pendiente de enriquecer desde TMDb.";
  const hasDuration = movie.durationMinutes > 0;
  const hasPoster = Boolean(movie.posterUrl);

  return !(hasGenres && hasDirector && hasSynopsis && hasDuration && hasPoster);
}

async function hydrateMovie(state: AppState, movie: Movie | null) {
  if (!movie || !movieNeedsHydration(movie)) {
    return false;
  }

  const previous = JSON.stringify(movie);
  const enriched = await resolveMovieMetadata(movie);
  Object.assign(movie, {
    ...movie,
    ...enriched,
    id: movie.id,
    slug: movie.slug
  });

  return JSON.stringify(movie) !== previous;
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

    await hydrateMoviesForDatabaseRead(pagedHistory.map((item) => item.movie));
    markDatabaseReadHealthy();
    return {
      genres,
      totalHistoryCount: allHistory.length,
      filteredHistoryCount: filteredHistory.length,
      totalPages,
      currentPage: safePage,
      pagedHistory
    };
  } catch (error) {
    markDatabaseReadFailure("viewed page read", error);
    return null;
  }
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
      loadMovieCatalogForRead(),
      loadNormalizedCollectionsCached(group.id)
    ]);
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

async function getProfileDataFromDatabase(userId: string) {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const users = await loadUsersForRead({ includeAvatarUrls: true });
    const user = users.find((entry) => entry.id === userId);
    if (!user) {
      return null;
    }

    const ratingRows = await prisma.ratingRecord.findMany({
      where: { userId },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }]
    });
    const ratings = mapRatingRecordsToStateEntries(ratingRows);
    const moviesById = await loadMoviesByIdsFromDatabase(ratings.map((rating) => rating.movieId));
    if (ratings.length > 0 && moviesById.size === 0) {
      return null;
    }

    const profile = buildProfileFromRatings(user, ratings, moviesById);
    await hydrateMoviesForDatabaseRead([...profile.topThree, ...profile.bottomThree].map((item) => item.movie));
    markDatabaseReadHealthy();
    profilePageDataMemoryCache.set(userId, writeTimedCacheWithTtl(profile, PAGE_ROUTE_CACHE_TTL_MS));
    return cloneState(profile);
  } catch (error) {
    markDatabaseReadFailure("profile page read", error);
    return null;
  }
}

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

async function getGroupPageDataFromDatabase() {
  if (!shouldAttemptDatabaseRead()) {
    return null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const group = getDatabaseReadGroup();
    const users = await loadUsersForRead({ includeAvatarUrls: true });
    const summaries = await prisma.ratingRecord.groupBy({
      by: ["userId"],
      _count: { _all: true },
      _avg: { score: true },
      _max: { score: true }
    });
    const summariesByUserId = new Map(
      summaries.map((summary) => [
        summary.userId,
        {
          ratingsCount: summary._count._all,
          averageScore: summary._avg.score ?? 0,
          bestScore: summary._max.score ?? 0
        }
      ])
    );
    const members = group.memberIds
      .map((memberId) => users.find((user) => user.id === memberId))
      .filter((member): member is User => Boolean(member))
      .map((member) => ({
        member,
        profileSummary: summariesByUserId.get(member.id) ?? {
          ratingsCount: 0,
          averageScore: 0,
          bestScore: 0
        }
      }));
    const groupData = { group, members };
    markDatabaseReadHealthy();
    groupPageDataMemoryCache = writeTimedCacheWithTtl(groupData, PAGE_ROUTE_CACHE_TTL_MS);
    return cloneState(groupData);
  } catch (error) {
    markDatabaseReadFailure("group page read", error);
    return null;
  }
}

function buildProfileFromState(state: AppState, userId: string): ProfileData | null {
  const cachedProfiles = profileDataCache.get(state);
  if (cachedProfiles?.has(userId)) {
    return cachedProfiles.get(userId) ?? null;
  }

  const user = findUserById(state, userId);
  if (!user) {
    return null;
  }

  const summary = getProfileSummaryFromState(state, userId);
  const overview = getProfileOverviewFromState(state, userId);

  const profile = {
    user,
    ratingsCount: summary.ratingsCount,
    averageScore: summary.averageScore,
    topThree: overview.topThree,
    bottomThree: overview.bottomThree,
    bestScore: summary.bestScore || overview.topThree[0]?.score || 0,
    distribution: overview.distribution
  };

  const nextProfiles = cachedProfiles ?? new Map<string, ProfileData | null>();
  nextProfiles.set(userId, profile);
  profileDataCache.set(state, nextProfiles);

  return profile;
}

export function getSessionCookieName() {
  return getSessionCookieNameFromSession();
}

const getSessionUserForRequest = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieNameFromSession())?.value;
  const userId = await verifySessionToken(token);
  if (!userId) {
    return null;
  }

  const users = await loadSnapshotUsersForRequest();
  return users.find((user) => user.id === userId) ?? null;
});

export async function getSessionUser() {
  return getSessionUserForRequest();
}

export async function listMembers() {
  const state = await loadAppState();
  return listMembersFromState(state);
}

export async function getUserByUsername(username: string) {
  const users = await loadSnapshotUsersForRequest();
  const normalizedUsername = normalizeUsername(username);
  return users.find((user) => normalizeUsername(user.username) === normalizedUsername) ?? null;
}

export async function listPendingHydrated() {
  const state = await loadAppState();
  const pending = listPendingFromState(state);
  await Promise.all(pending.map((movie) => hydrateMovie(state, movie)));
  return listPendingFromState(state);
}

export async function listHistory(filters?: HistoryFilters, currentUserId?: string) {
  const state = await loadAppState();
  return buildHistoryFromState(state, filters, currentUserId);
}

export async function listHistoryHydrated(filters?: HistoryFilters, currentUserId?: string) {
  const state = await loadAppState();
  const history = buildHistoryFromState(state, filters, currentUserId);
  await Promise.all(history.map((item) => hydrateMovie(state, item.movie)));
  return buildHistoryFromState(state, filters, currentUserId);
}

export async function getProfileDataHydrated(userId: string) {
  const cached = readTimedCache(profilePageDataMemoryCache.get(userId));
  if (cached !== null) {
    return cached;
  }

  if (shouldUseDatabase()) {
    const databaseProfile = await getProfileDataFromDatabase(userId);
    if (databaseProfile) {
      return databaseProfile;
    }
  }

  const state = await loadAppState();
  const profile = buildProfileFromState(state, userId);
  if (!profile) {
    profilePageDataMemoryCache.set(userId, writeTimedCacheWithTtl<ProfileData | null>(null, PAGE_ROUTE_CACHE_TTL_MS));
    return null;
  }

  const moviesToHydrate = new Map<string, Movie>();
  [...profile.topThree, ...profile.bottomThree].forEach((item) => {
    moviesToHydrate.set(item.movie.id, item.movie);
  });
  await Promise.all([...moviesToHydrate.values()].map((movie) => hydrateMovie(state, movie)));

  const hydratedProfile = buildProfileFromState(state, userId);
  profilePageDataMemoryCache.set(userId, writeTimedCacheWithTtl(hydratedProfile, PAGE_ROUTE_CACHE_TTL_MS));
  return hydratedProfile;
}

export async function getCurrentBatch() {
  const state = await loadAppState();
  const { batch, changed } = await ensureDashboardBatch(state);
  if (changed && batch) {
    await persistStateChange(state, [
      {
        run: () => insertWeeklyBatchToDatabase(batch),
        deferred: {
          type: "weekly-batch-upsert",
          batch
        }
      }
    ]);
  }
  return batch;
}

export async function getWatchEntryForMovie(movieId: string) {
  const state = await loadAppState();
  return getWatchEntryForMovieFromState(state, movieId);
}

export async function getRatingsForMovie(movieId: string) {
  const state = await loadAppState();
  return getRatingsForMovieFromState(state, movieId);
}

export async function getMovieBySlugHydrated(slug: string) {
  const state = await loadAppState();
  const movie = getMovieBySlug(state, slug);
  await hydrateMovie(state, movie);
  return movie;
}

export async function getMovieDetailDataHydrated(slug: string, currentUserId?: string) {
  const cacheKey = `${slug}:${currentUserId ?? "anon"}`;
  const cached = readTimedCache(movieDetailDataMemoryCache.get(cacheKey));
  if (cached !== null) {
    return cached;
  }

  if (shouldUseDatabase()) {
    const databaseDetail = await getMovieDetailDataFromDatabase(slug, currentUserId);
    if (databaseDetail) {
      movieDetailDataMemoryCache.set(cacheKey, writeTimedCacheWithTtl(databaseDetail, MOVIE_DETAIL_CACHE_TTL_MS));
      return databaseDetail;
    }
  }

  const state = await loadAppState();
  const movie = getMovieBySlug(state, slug);
  if (!movie) {
      movieDetailDataMemoryCache.set(cacheKey, writeTimedCacheWithTtl(null, MOVIE_DETAIL_CACHE_TTL_MS));
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
    movieDetailDataMemoryCache.set(cacheKey, writeTimedCacheWithTtl(detailData, MOVIE_DETAIL_CACHE_TTL_MS));
  return detailData;
}

export async function getDashboardData() {
  const state = await loadAppState();
  return {
    ...(await getDashboardOverviewHydrated()),
    upcomingReleases: await buildUpcomingDashboardReleases(state)
  };
}

export async function getDashboardOverviewHydrated() {
  const cached = readTimedCache(dashboardDataMemoryCache);
  if (cached) {
    return cached;
  }

  if (shouldUseDatabase()) {
    const databaseDashboard = await loadDashboardDataFromDatabase();
    if (databaseDashboard) {
      return databaseDashboard;
    }
  }

  const state = await loadAppState();
  const dashboardData = buildDashboardDataFromState(state);
  dashboardDataMemoryCache = writeTimedCacheWithTtl(dashboardData, PAGE_ROUTE_CACHE_TTL_MS);
  return dashboardData;
}

export async function getUpcomingDashboardReleasesHydrated() {
  const state = await loadAppState();
  return buildUpcomingDashboardReleases(state);
}

export async function getDashboardDataHydrated() {
  return {
    ...(await getDashboardOverviewHydrated()),
    upcomingReleases: await getUpcomingDashboardReleasesHydrated()
  };
}

export async function getGroupPageData() {
  const cached = readTimedCache(groupPageDataMemoryCache);
  if (cached) {
    return cached;
  }

  if (shouldUseDatabase()) {
    const databaseGroupData = await getGroupPageDataFromDatabase();
    if (databaseGroupData) {
      return databaseGroupData;
    }
  }

  const state = await loadAppState();
  const groupData = {
    group: state.group,
    members: listMembersFromState(state).map((member) => ({
      member,
      profileSummary: getProfileSummaryFromState(state, member.id)
    }))
  };
  groupPageDataMemoryCache = writeTimedCacheWithTtl(groupData, PAGE_ROUTE_CACHE_TTL_MS);
  return groupData;
}

export async function getPendingWeeklySuggestionsHydrated() {
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

export async function getPendingPageDataHydrated(input: { search?: string; genre?: string; page?: number; pageSize?: number }) {
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

export async function getViewedPageDataHydrated(input: {
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

  for (const item of pagedHistory) {
    moviesToHydrate.set(item.movie.id, item.movie);
  }

  await Promise.all([...moviesToHydrate.values()].map((movie) => hydrateMovie(state, movie)));

  return {
    genres,
    totalHistoryCount,
    filteredHistoryCount: filteredHistory.length,
    totalPages,
    currentPage: safePage,
    pagedHistory
  };
}

export async function authenticateUser(username: string, password: string) {
  const users = await loadSnapshotUsersCached();
  const normalizedIdentifier = normalizeUsername(username);
  const user =
    users.find(
      (entry) =>
        normalizeUsername(entry.username) === normalizedIdentifier ||
        normalizeIdentity(entry.name) === normalizedIdentifier
    ) ?? null;
  if (!user) {
    return null;
  }

  return verifyPassword(password, user.passwordHash) ? user : null;
}

export async function updateUserProfile(
  userId: string,
  input: {
    name: string;
    username: string;
    password?: string;
    avatarAction?: "keep" | "replace" | "remove";
    avatarDataUrl?: string;
  }
) {
  const state = await loadAppStateUncached();
  const user = findUserById(state, userId);
  if (!user) {
    throw new Error("No se encontró el usuario.");
  }

  const nextName = input.name.trim();
  const nextUsername = input.username.trim();
  if (!nextName) {
    throw new Error("El nombre visible es obligatorio.");
  }
  if (!nextUsername) {
    throw new Error("El usuario es obligatorio.");
  }
  validateDisplayName(nextName);
  validateUsername(nextUsername);

  const usernameTaken = state.users.some(
    (entry) => entry.id !== userId && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
  );
  if (usernameTaken) {
    throw new Error("Ese usuario ya lo está usando otra persona.");
  }

  const previousName = user.name;
  user.name = nextName;
  user.username = nextUsername;
  user.avatarSeed = slugify(nextName);
  if (input.avatarAction === "remove") {
    user.avatarUrl = undefined;
  } else if (input.avatarAction === "replace" && input.avatarDataUrl?.trim()) {
    user.avatarUrl = sanitizeAvatarDataUrl(input.avatarDataUrl);
  }
  if (input.password?.trim()) {
    validatePassword(input.password.trim());
    user.passwordHash = hashPassword(input.password.trim());
  }

  addActivity(state, {
    type: "rated",
    label: previousName === nextName ? `${nextName} actualizó su perfil` : `${previousName} ahora aparece como ${nextName}`,
    userId: user.id,
    date: new Date().toISOString()
  });

  invalidateDerivedCaches(state);
  await persistStateChange(
    state,
    [
      {
        run: () => upsertUserToDatabase(user),
        deferred: {
          type: "user-upsert",
          user
        }
      }
    ],
    { snapshotStrategy: "eager" }
  );
  return user;
}

export async function updateUserCredentialsByAdmin(
  adminUserId: string,
  input: {
    userId: string;
    username: string;
    password?: string;
  }
) {
  const state = await loadAppStateUncached();
  const adminUser = findUserById(state, adminUserId);
  if (!adminUser?.isAdmin) {
    throw new Error("No tienes permisos para gestionar cuentas del grupo.");
  }

  const targetUser = findUserById(state, input.userId);
  if (!targetUser) {
    throw new Error("No se encontró la cuenta que quieres editar.");
  }

  const nextUsername = input.username.trim();
  const nextPassword = input.password?.trim() ?? "";

  if (!nextUsername) {
    throw new Error("El usuario no puede quedar vacío.");
  }
  validateUsername(nextUsername);

  const usernameTaken = state.users.some(
    (entry) => entry.id !== targetUser.id && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
  );
  if (usernameTaken) {
    throw new Error("Ese usuario ya lo está usando otra persona.");
  }

  const previousUsername = targetUser.username;
  targetUser.username = nextUsername;

  if (nextPassword) {
    validatePassword(nextPassword);
    targetUser.passwordHash = hashPassword(nextPassword);
  }

  addActivity(state, {
    type: "rated",
    label:
      previousUsername === nextUsername
        ? `${adminUser.name} actualizó el acceso de ${targetUser.name}`
        : `${adminUser.name} cambió el usuario de ${targetUser.name} a @${nextUsername}`,
    userId: targetUser.id,
    date: new Date().toISOString()
  });

  invalidateDerivedCaches(state);
  await persistStateChange(
    state,
    [
      {
        run: () => upsertUserToDatabase(targetUser),
        deferred: {
          type: "user-upsert",
          user: targetUser
        }
      }
    ],
    { snapshotStrategy: "eager" }
  );

  return {
    id: targetUser.id,
    name: targetUser.name,
    username: targetUser.username
  };
}

export async function resetUserCredentials(input: {
  adminCode: string;
  identifier: string;
  username: string;
  password: string;
}) {
  if (!ADMIN_RESET_CODE) {
    throw new Error("El reset no esta disponible todavía. Falta configurar ADMIN_RESET_CODE.");
  }

  if (!secureStringMatch(input.adminCode.trim(), ADMIN_RESET_CODE)) {
    throw new Error("El codigo de administración no es valido.");
  }

  const state = await loadAppStateUncached();
  const user = findUserByIdentity(state, input.identifier);
  if (!user) {
    throw new Error("No se encontró ninguna cuenta con ese usuario o nombre visible.");
  }

  const nextUsername = input.username.trim();
  const nextPassword = input.password.trim();

  if (!nextUsername) {
    throw new Error("El nuevo usuario es obligatorio.");
  }

  if (!nextPassword) {
    throw new Error("La nueva contraseña es obligatoria.");
  }
  validateUsername(nextUsername);
  validatePassword(nextPassword);

  const usernameTaken = state.users.some(
    (entry) => entry.id !== user.id && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
  );
  if (usernameTaken) {
    throw new Error("Ese usuario ya lo está usando otra persona.");
  }

  user.username = nextUsername;
  user.passwordHash = hashPassword(nextPassword);

  addActivity(state, {
    type: "rated",
    label: `Se restableció el acceso de ${user.name}`,
    userId: user.id,
    date: new Date().toISOString()
  });

  invalidateDerivedCaches(state);
  await persistStateChange(
    state,
    [
      {
        run: () => upsertUserToDatabase(user),
        deferred: {
          type: "user-upsert",
          user
        }
      }
    ],
    { snapshotStrategy: "eager" }
  );

  return {
    id: user.id,
    name: user.name,
    username: user.username
  };
}

export async function upsertRating(input: { movieId: string; userId: string; score: number; comment?: string }) {
  const state = await loadAppStateUncached();
  const comment = sanitizeComment(input.comment);
  const ratingKey = `${input.userId}:${input.movieId}`;
  const existing = getStateIndexes(state).ratingByUserMovie.get(ratingKey);

  if (existing) {
    existing.score = input.score;
    existing.comment = comment;
  } else {
    state.ratings.push({
      id: safeId("rating", `${input.movieId}-${input.userId}`),
      movieId: input.movieId,
      userId: input.userId,
      score: input.score,
      comment
    });
  }

  const user = findUserById(state, input.userId);
  const movie = getMovieById(state, input.movieId);
  if (user && movie) {
    addActivity(state, {
      type: "rated",
      label: `${user.name} puntuó ${movie.title} con un ${input.score.toFixed(1)}`,
      movieId: movie.id,
      userId: user.id,
      date: new Date().toISOString()
    });
  }

  invalidateDerivedCaches(state);
  const nextRating = getStateIndexes(state).ratingByUserMovie.get(ratingKey) as UserRating;
  await persistStateChange(state, [
    {
      run: () => upsertRatingToDatabase(nextRating),
      deferred: {
        type: "rating-upsert",
        rating: nextRating
      }
    }
  ]);
  return nextRating;
}

export async function generateBatch() {
  const state = await loadAppStateUncached();
  const currentBatch = getCurrentBatchFromState(state);
  const batch = generateWeeklyRecommendations(state);
  if (currentBatch?.selectedMovieId) {
    batch.selectedMovieId = currentBatch.selectedMovieId;
  }
  state.weeklyBatches.unshift(batch);
  addActivity(state, {
    type: "recommended",
    label: "Se generó una nueva tanda de recomendaciones para esta semana",
    date: batch.createdAt
  });
  invalidateDerivedCaches(state);
  await persistStateChange(state, [
    {
      run: () => insertWeeklyBatchToDatabase(batch),
      deferred: {
        type: "weekly-batch-upsert",
        batch
      }
    }
  ]);
  return batch;
}

export async function selectWeeklyMovie(batchId: string, movieId: string) {
  const state = await loadAppStateUncached();
  const batch = getStateIndexes(state).weeklyBatchById.get(batchId);
  if (!batch) {
    throw new Error("No se encontró la tanda semanal.");
  }

  batch.selectedMovieId = movieId;
  const movie = getMovieById(state, movieId);
  if (movie) {
    addActivity(state, {
      type: "recommended",
      label: `La película de la semana pasó a ser ${movie.title}`,
      movieId: movie.id,
      date: new Date().toISOString()
    });
  }

  invalidateDerivedCaches(state);
  await persistStateChange(state, [
    {
      run: () => updateWeeklyBatchSelectionInDatabase(batch.id, batch.selectedMovieId),
      deferred: {
        type: "weekly-batch-selection",
        batchId: batch.id,
        selectedMovieId: batch.selectedMovieId
      }
    }
  ]);
  return batch;
}

export async function markMovieAsWatched(movieId: string, watchedOn = new Date().toISOString()) {
  const state = await loadAppStateUncached();
  const movie = getMovieById(state, movieId);
  if (!movie) {
    throw new Error("No se encontró la película.");
  }

  const existingEntry = getWatchEntryForMovieFromState(state, movieId);
  if (existingEntry) {
    if (!existingEntry.watchedOn) {
      existingEntry.watchedOn = watchedOn;
      invalidateDerivedCaches(state);
      await persistStateChange(state, [
        {
          run: () => upsertWatchEntryToDatabase(existingEntry),
          deferred: {
            type: "watch-upsert",
            entry: existingEntry
          }
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
      run: () => upsertWatchEntryToDatabase(watchEntry),
      deferred: {
        type: "watch-upsert",
        entry: watchEntry
      }
    },
    {
      run: () => removePendingMovieFromDatabase(state.group.id, movieId),
      deferred: {
        type: "pending-remove",
        groupId: state.group.id,
        movieId
      }
    }
  ]);
  return watchEntry;
}

export async function movieSearch(query: string) {
  const state = await loadAppState();
  return searchMovies(query, state.movies);
}

export async function addPendingMovie(movieInput: Movie) {
  const state = await loadAppStateUncached();
  let movie =
    (movieInput.sourceIds?.tmdb ? getMovieByTmdbId(state, movieInput.sourceIds.tmdb) : null) ??
    state.movies.find((entry) => entry.slug === movieInput.slug && entry.year === movieInput.year) ??
    null;

  if (!movie) {
    movie = {
      ...movieInput,
      id: movieInput.sourceIds?.tmdb ? `movie_tmdb_${movieInput.sourceIds.tmdb}` : safeId("movie", movieInput.title),
      slug: slugify(movieInput.title)
    };
    state.movies.push(movie);
  }

  await hydrateMovie(state, movie);

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
  await persistPendingStateChangeStrict(state, [
    {
      run: () => upsertMovieToDatabase(movie),
      deferred: {
        type: "movie-upsert",
        movie
      }
    },
    {
      run: () => upsertPendingMovieToDatabase(state.group.id, movie.id, addedAt),
      deferred: {
        type: "pending-upsert",
        groupId: state.group.id,
        movieId: movie.id,
        addedAt: addedAt.toISOString()
      }
    }
  ]);
  return {
    status: "added" as const,
    movie,
    message: "Película añadida a pendientes."
  };
}

export async function removePendingMovie(movieId: string) {
  const state = await loadAppStateUncached();
  const movie = getMovieById(state, movieId);
  if (!movie) {
    throw new Error("No se encontró la película.");
  }

  if (!state.pendingMovieIds.includes(movieId)) {
    return {
      status: "not_pending" as const,
      movie,
      message: "Esa película ya no estaba en pendientes."
    };
  }

  state.pendingMovieIds = state.pendingMovieIds.filter((pendingMovieId) => pendingMovieId !== movieId);
  addActivity(state, {
    type: "queued",
    label: `${movie.title} se quitó de pendientes`,
    movieId: movie.id,
    date: new Date().toISOString()
  });
  invalidateDerivedCaches(state);
  await persistStateChange(state, [
    {
      run: () => removePendingMovieFromDatabase(state.group.id, movieId),
      deferred: {
        type: "pending-remove",
        groupId: state.group.id,
        movieId
      }
    }
  ]);

  return {
    status: "removed" as const,
    movie,
    message: "Película quitada de pendientes."
  };
}
