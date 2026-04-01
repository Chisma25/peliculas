import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

import { cookies } from "next/headers";
import { cache } from "react";

import { seedState } from "@/lib/demo-data";
import { loadManualHistorySeed } from "@/lib/manual-history";
import { resolveMovieMetadata, searchMovies } from "@/lib/movie-provider";
import { generatePendingWeeklyOptions, generateWeeklyRecommendations } from "@/lib/recommendations";
import { getSessionCookieName as getSessionCookieNameFromSession, verifySessionToken } from "@/lib/session";
import { ActivityItem, AppState, Movie, User, UserRating } from "@/lib/types";
import { average, getMovieAverage, safeId, slugify } from "@/lib/utils";
const DATA_DIR = join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIR, "runtime-state.json");
const SNAPSHOT_ID = process.env.APP_SNAPSHOT_ID || "main";
const ADMIN_RESET_CODE = process.env.ADMIN_RESET_CODE?.trim() || "";

const INITIAL_PASSWORDS = {
  Isma: "Roca7!Marea",
  Vargues: "Niebla4!Faro",
  Meneses: "Tinta9!Clave",
  Jose: "Atlas6!Cobre",
  Javi: "Bruma8!Lince",
  Huguito: "Trama5!Sable"
} satisfies Record<string, string>;

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

function getInitialPasswordForUser(name: string) {
  return INITIAL_PASSWORDS[name as keyof typeof INITIAL_PASSWORDS] ?? "Clave9!Cine";
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
  return {
    ...user,
    username,
    avatarSeed: user.avatarSeed || slugify(user.name || username),
    passwordHash: user.passwordHash || hashPassword(getInitialPasswordForUser(user.name)),
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
    .replace(/\bcontrasena\b/g, "contraseña")
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
                    ? "Puede ser una gran eleccion porque es la que mejor equilibra calidad, afinidad y plan de grupo."
                    : index === 1
                      ? "Os puede encajar porque cambia el tono sin alejarse demasiado de vuestros gustos."
                      : "Puede merecer la pena porque aporta variedad real frente a lo que soleis ver juntos.",
                reasons: []
              }))
            }
          ]
        : [],
    activity: [
      {
        type: "watched",
        label: `Se cargo el historico del grupo con ${manualSeed.movies.length} peliculas vistas`,
        date: new Date().toISOString()
      }
    ]
  });
}

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

function loadLocalStateFromDisk() {
  try {
    if (!existsSync(STATE_FILE)) {
      return null;
    }

    const raw = readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isAppState(parsed) ? ensureStateIntegrity(parsed) : null;
  } catch {
    return null;
  }
}

function saveLocalStateToDisk(state: AppState) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Persistencia local best-effort.
  }
}

async function loadDatabaseState() {
  const { prisma } = await import("@/lib/prisma");
  const snapshot = await prisma.appSnapshot.findUnique({
    where: {
      id: SNAPSHOT_ID
    }
  });

  if (!snapshot) {
    return null;
  }

  return isAppState(snapshot.data) ? ensureStateIntegrity(snapshot.data) : null;
}

async function saveDatabaseState(state: AppState) {
  const { prisma } = await import("@/lib/prisma");
  await prisma.appSnapshot.upsert({
    where: {
      id: SNAPSHOT_ID
    },
    create: {
      id: SNAPSHOT_ID,
      data: state
    },
    update: {
      data: state
    }
  });
}

async function loadAppStateUncached() {
  if (shouldUseDatabase()) {
    const databaseState = await loadDatabaseState();
    if (databaseState) {
      return databaseState;
    }

    const initial = loadLocalStateFromDisk() ?? buildInitialState();
    await saveDatabaseState(initial);
    return initial;
  }

  const localState = loadLocalStateFromDisk();
  if (localState) {
    return localState;
  }

  const initial = buildInitialState();
  saveLocalStateToDisk(initial);
  return initial;
}

const loadAppState = cache(loadAppStateUncached);

async function saveAppState(state: AppState) {
  if (shouldUseDatabase()) {
    await saveDatabaseState(state);
    return;
  }

  saveLocalStateToDisk(state);
}

function findUserById(state: AppState, userId?: string | null) {
  return state.users.find((user) => user.id === userId) ?? null;
}

function findUserByUsername(state: AppState, username?: string | null) {
  const normalizedUsername = normalizeUsername(username ?? "");
  return state.users.find((user) => normalizeUsername(user.username) === normalizedUsername) ?? null;
}

function findUserByIdentity(state: AppState, identifier?: string | null) {
  const normalizedIdentifier = normalizeIdentity(identifier ?? "");
  if (!normalizedIdentifier) {
    return null;
  }

  return (
    state.users.find((user) => normalizeUsername(user.username) === normalizedIdentifier) ??
    state.users.find((user) => normalizeIdentity(user.name) === normalizedIdentifier) ??
    null
  );
}

function getMovieById(state: AppState, movieId: string) {
  return state.movies.find((movie) => movie.id === movieId) ?? null;
}

function getMovieByTmdbId(state: AppState, tmdbId: string) {
  return state.movies.find((movie) => movie.sourceIds?.tmdb === tmdbId) ?? null;
}

function getMovieBySlug(state: AppState, slug: string) {
  return state.movies.find((movie) => movie.slug === slug) ?? null;
}

function getCurrentBatchFromState(state: AppState) {
  return [...state.weeklyBatches].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function isDashboardBatchValid(state: AppState, batch: AppState["weeklyBatches"][number] | null) {
  if (!batch || batch.items.length !== 3) {
    return false;
  }

  const seenIds = new Set(state.watchEntries.map((entry) => entry.movieId));
  const pendingIds = new Set(state.pendingMovieIds);

  return batch.items.every((item) => {
    const movie = getMovieById(state, item.movieId);
    return (
      Boolean(movie) &&
      !seenIds.has(item.movieId) &&
      !pendingIds.has(item.movieId) &&
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
  return {
    batch: refreshedBatch,
    changed: true
  };
}

function getWatchEntryForMovieFromState(state: AppState, movieId: string) {
  return state.watchEntries.find((entry) => entry.movieId === movieId) ?? null;
}

function getRatingsForMovieFromState(state: AppState, movieId: string) {
  return state.ratings.filter((rating) => rating.movieId === movieId);
}

function listMembersFromState(state: AppState) {
  return state.group.memberIds.map((memberId) => findUserById(state, memberId)).filter((user): user is User => Boolean(user));
}

function listPendingFromState(state: AppState) {
  return state.pendingMovieIds.map((movieId) => getMovieById(state, movieId)).filter((movie): movie is Movie => Boolean(movie));
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
  const watchedMovies: HistoryItem[] = state.watchEntries.flatMap((entry) => {
    const movie = getMovieById(state, entry.movieId);
    if (!movie) {
      return [];
    }

    const ratings = state.ratings.filter((rating) => rating.movieId === movie.id);
    const userRating = currentUserId ? ratings.find((rating) => rating.userId === currentUserId)?.score : undefined;

    return [
      {
        movie,
        watchedOn: entry.watchedOn,
        groupAverage: getMovieAverage(movie.id, state.ratings),
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

function buildProfileFromState(state: AppState, userId: string): ProfileData | null {
  const user = findUserById(state, userId);
  if (!user) {
    return null;
  }

  const userRatings = state.ratings
    .filter((rating) => rating.userId === userId)
    .map((rating) => ({
      ...rating,
      movie: getMovieById(state, rating.movieId)
    }))
    .filter((rating): rating is UserRating & { movie: Movie } => Boolean(rating.movie));

  const averageScore = average(userRatings.map((rating) => rating.score));
  const topThree = [...userRatings].sort((left, right) => right.score - left.score || right.movie.year - left.movie.year).slice(0, 3);
  const bottomThree = [...userRatings].sort((left, right) => left.score - right.score || right.movie.year - left.movie.year).slice(0, 3);

  const distributionStep = 0.5;
  const distributionBins = Array.from({ length: Math.floor(10 / distributionStep) + 1 }, (_, index) => ({
    value: Number((index * distributionStep).toFixed(1)),
    label: (index * distributionStep).toFixed(1),
    count: 0
  }));

  for (const rating of userRatings) {
    const bucket = Math.max(0, Math.min(distributionBins.length - 1, Math.round(rating.score / distributionStep)));
    distributionBins[bucket].count += 1;
  }

  const maxDistributionCount = Math.max(...distributionBins.map((item) => item.count), 1);

  return {
    user,
    ratingsCount: userRatings.length,
    averageScore,
    topThree,
    bottomThree,
    bestScore: topThree[0]?.score ?? 0,
    distribution: distributionBins.map((item, index) => ({
      ...item,
      ratio: item.count / maxDistributionCount,
      axisLabel: index % 2 === 0 ? item.label : ""
    }))
  };
}

export function getSessionCookieName() {
  return getSessionCookieNameFromSession();
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieNameFromSession())?.value;
  const userId = await verifySessionToken(token);
  if (!userId) {
    return null;
  }
  const state = await loadAppState();
  return findUserById(state, userId);
}

export async function listMembers() {
  const state = await loadAppState();
  return listMembersFromState(state);
}

export async function getUserByUsername(username: string) {
  const state = await loadAppState();
  return findUserByUsername(state, username);
}

export async function listPendingHydrated() {
  const state = await loadAppState();
  const pending = listPendingFromState(state);
  const hydrated = await Promise.all(pending.map((movie) => hydrateMovie(state, movie)));
  if (hydrated.some(Boolean)) {
    await saveAppState(state);
  }
  return listPendingFromState(state);
}

export async function listHistory(filters?: HistoryFilters, currentUserId?: string) {
  const state = await loadAppState();
  return buildHistoryFromState(state, filters, currentUserId);
}

export async function listHistoryHydrated(filters?: HistoryFilters, currentUserId?: string) {
  const state = await loadAppState();
  const history = buildHistoryFromState(state, filters, currentUserId);
  const hydrated = await Promise.all(history.map((item) => hydrateMovie(state, item.movie)));
  if (hydrated.some(Boolean)) {
    await saveAppState(state);
  }
  return buildHistoryFromState(state, filters, currentUserId);
}

export async function getProfileDataHydrated(userId: string) {
  const state = await loadAppState();
  const ratedMovies = state.ratings
    .filter((rating) => rating.userId === userId)
    .map((rating) => getMovieById(state, rating.movieId))
    .filter((movie): movie is Movie => Boolean(movie));

  const hydrated = await Promise.all(ratedMovies.map((movie) => hydrateMovie(state, movie)));
  if (hydrated.some(Boolean)) {
    await saveAppState(state);
  }

  return buildProfileFromState(state, userId);
}

export async function getCurrentBatch() {
  const state = await loadAppState();
  const { batch, changed } = await ensureDashboardBatch(state);
  if (changed) {
    await saveAppState(state);
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
  const changed = await hydrateMovie(state, movie);
  if (changed) {
    await saveAppState(state);
  }
  return movie;
}

export async function getDashboardData() {
  const state = await loadAppState();
  const batch = getCurrentBatchFromState(state);

  return {
    group: state.group,
    members: listMembersFromState(state),
    pendingMovies: listPendingFromState(state),
    recommendations: [],
    batch,
    selectedMovie: batch?.selectedMovieId ? getMovieById(state, batch.selectedMovieId) : null,
    selectedWatchEntry: batch?.selectedMovieId ? getWatchEntryForMovieFromState(state, batch.selectedMovieId) : null,
    recentActivity: state.activity.slice(0, 5),
    stats: {
      watchedCount: state.watchEntries.length,
      averageScore: average(state.watchEntries.map((entry) => getMovieAverage(entry.movieId, state.ratings)).filter((value) => value > 0)),
      pendingCount: state.pendingMovieIds.length
    }
  };
}

export async function getDashboardDataHydrated() {
  const state = await loadAppState();
  const batch = getCurrentBatchFromState(state);
  const selectedMovie = batch?.selectedMovieId ? getMovieById(state, batch.selectedMovieId) : null;
  const hydrated = await Promise.all([hydrateMovie(state, selectedMovie)]);

  if (hydrated.some(Boolean)) {
    await saveAppState(state);
  }

  return {
    group: state.group,
    members: listMembersFromState(state),
    pendingMovies: listPendingFromState(state),
    recommendations: [],
    batch,
    selectedMovie: batch?.selectedMovieId ? getMovieById(state, batch.selectedMovieId) : null,
    selectedWatchEntry: batch?.selectedMovieId ? getWatchEntryForMovieFromState(state, batch.selectedMovieId) : null,
    recentActivity: state.activity.slice(0, 5),
    stats: {
      watchedCount: state.watchEntries.length,
      averageScore: average(state.watchEntries.map((entry) => getMovieAverage(entry.movieId, state.ratings)).filter((value) => value > 0)),
      pendingCount: state.pendingMovieIds.length
    }
  };
}

export async function getGroupPageData() {
  const state = await loadAppState();

  return {
    group: state.group,
    members: listMembersFromState(state).map((member) => ({
      member,
      profile: buildProfileFromState(state, member.id)
    })),
    stats: {
      watchedCount: state.watchEntries.length,
      averageScore: average(state.watchEntries.map((entry) => getMovieAverage(entry.movieId, state.ratings)).filter((value) => value > 0)),
      pendingCount: state.pendingMovieIds.length
    }
  };
}

export async function getPendingWeeklySuggestionsHydrated() {
  const state = await loadAppState();
  const suggestions = generatePendingWeeklyOptions(state);
  const movies = suggestions
    .map((item) => getMovieById(state, item.movieId))
    .filter((movie): movie is Movie => Boolean(movie));

  const hydrated = await Promise.all(movies.map((movie) => hydrateMovie(state, movie)));
  if (hydrated.some(Boolean)) {
    await saveAppState(state);
  }

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
  const state = await loadAppState();
  const search = input.search?.trim() ?? "";
  const activeGenre = input.genre?.trim() ?? "";
  const currentPage = input.page && input.page > 0 ? input.page : 1;
  const itemsPerPage = input.pageSize && input.pageSize > 0 ? input.pageSize : 15;
  const pending = listPendingFromState(state);
  const batch = getCurrentBatchFromState(state);
  const weeklyOptions = generatePendingWeeklyOptions(state);

  const genres = Array.from(
    new Set(
      pending
        .flatMap((movie) => movie.genres)
        .map((genre) => genre.trim())
        .filter((genre) => genre && genre.toLowerCase() !== "pendiente")
    )
  ).sort((left, right) => left.localeCompare(right, "es"));

  const filteredPending = pending.filter((movie) => {
    const matchesSearch =
      !search ||
      `${movie.title} ${movie.year} ${movie.director} ${movie.cast.join(" ")}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es"));

    const matchesGenre =
      !activeGenre || movie.genres.some((genre) => genre.toLocaleLowerCase("es") === activeGenre.toLocaleLowerCase("es"));

    return matchesSearch && matchesGenre;
  });

  const moviesToHydrate = new Map<string, Movie>();
  const totalPages = Math.max(1, Math.ceil(filteredPending.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * itemsPerPage;
  const pagedPending = filteredPending.slice(pageStart, pageStart + itemsPerPage);

  for (const movie of pagedPending) {
    moviesToHydrate.set(movie.id, movie);
  }
  for (const item of weeklyOptions) {
    const movie = getMovieById(state, item.movieId);
    if (movie) {
      moviesToHydrate.set(movie.id, movie);
    }
  }

  const hydrated = await Promise.all([...moviesToHydrate.values()].map((movie) => hydrateMovie(state, movie)));
  if (hydrated.some(Boolean)) {
    await saveAppState(state);
  }

  const refreshedPending = listPendingFromState(state);
  const refreshedFilteredPending = refreshedPending.filter((movie) => {
    const matchesSearch =
      !search ||
      `${movie.title} ${movie.year} ${movie.director} ${movie.cast.join(" ")}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es"));

    const matchesGenre =
      !activeGenre || movie.genres.some((genre) => genre.toLocaleLowerCase("es") === activeGenre.toLocaleLowerCase("es"));

    return matchesSearch && matchesGenre;
  });

  return {
    batch,
    pending: refreshedPending,
    genres,
    filteredPending: refreshedFilteredPending,
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
  const state = await loadAppState();
  const currentPage = input.page && input.page > 0 ? input.page : 1;
  const itemsPerPage = input.pageSize && input.pageSize > 0 ? input.pageSize : 15;
  const history = buildHistoryFromState(
    state,
    {
      search: input.search,
      year: input.year,
      genre: input.genre,
      sort: input.sort
    },
    input.currentUserId
  );
  const allHistory = buildHistoryFromState(state, undefined, input.currentUserId);

  const genres = Array.from(
    new Set(
      allHistory
        .flatMap((item) => item.movie.genres)
        .map((item) => item.trim())
        .filter((item) => item && item.toLowerCase() !== "pendiente")
    )
  ).sort((left, right) => left.localeCompare(right, "es"));

  const moviesToHydrate = new Map<string, Movie>();
  const totalPages = Math.max(1, Math.ceil(history.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * itemsPerPage;
  const pagedHistory = history.slice(pageStart, pageStart + itemsPerPage);

  for (const item of pagedHistory) {
    moviesToHydrate.set(item.movie.id, item.movie);
  }

  const hydrated = await Promise.all([...moviesToHydrate.values()].map((movie) => hydrateMovie(state, movie)));
  if (hydrated.some(Boolean)) {
    await saveAppState(state);
  }

  return {
    history: buildHistoryFromState(
      state,
      {
        search: input.search,
        year: input.year,
        genre: input.genre,
        sort: input.sort
      },
      input.currentUserId
    ),
    allHistory: buildHistoryFromState(state, undefined, input.currentUserId),
    genres
  };
}

export async function authenticateUser(username: string, password: string) {
  const state = await loadAppStateUncached();
  const user = state.users.find((entry) => normalizeUsername(entry.username) === normalizeUsername(username)) ?? null;
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
    throw new Error("No se encontro el usuario.");
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
    throw new Error("Ese usuario ya lo esta usando otra persona.");
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

  await saveAppState(state);
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
    throw new Error("No se encontro la cuenta que quieres editar.");
  }

  const nextUsername = input.username.trim();
  const nextPassword = input.password?.trim() ?? "";

  if (!nextUsername) {
    throw new Error("El usuario no puede quedar vacio.");
  }
  validateUsername(nextUsername);

  const usernameTaken = state.users.some(
    (entry) => entry.id !== targetUser.id && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
  );
  if (usernameTaken) {
    throw new Error("Ese usuario ya lo esta usando otra persona.");
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

  await saveAppState(state);

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
    throw new Error("El reset no esta disponible todavia. Falta configurar ADMIN_RESET_CODE.");
  }

  if (!secureStringMatch(input.adminCode.trim(), ADMIN_RESET_CODE)) {
    throw new Error("El codigo de administracion no es valido.");
  }

  const state = await loadAppStateUncached();
  const user = findUserByIdentity(state, input.identifier);
  if (!user) {
    throw new Error("No se encontro ninguna cuenta con ese usuario o nombre visible.");
  }

  const nextUsername = input.username.trim();
  const nextPassword = input.password.trim();

  if (!nextUsername) {
    throw new Error("El nuevo usuario es obligatorio.");
  }

  if (!nextPassword) {
    throw new Error("La nueva contrasena es obligatoria.");
  }
  validateUsername(nextUsername);
  validatePassword(nextPassword);

  const usernameTaken = state.users.some(
    (entry) => entry.id !== user.id && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
  );
  if (usernameTaken) {
    throw new Error("Ese usuario ya lo esta usando otra persona.");
  }

  user.username = nextUsername;
  user.passwordHash = hashPassword(nextPassword);

  addActivity(state, {
    type: "rated",
    label: `Se restableció el acceso de ${user.name}`,
    userId: user.id,
    date: new Date().toISOString()
  });

  await saveAppState(state);

  return {
    id: user.id,
    name: user.name,
    username: user.username
  };
}

export async function getSeededCredentials() {
  const state = await loadAppState();
  return state.users
    .filter((user) => user.name in INITIAL_PASSWORDS)
    .map((user) => ({
      name: user.name,
      username: user.username,
      password: getInitialPasswordForUser(user.name)
    }));
}

export async function upsertRating(input: { movieId: string; userId: string; score: number; comment?: string }) {
  const state = await loadAppStateUncached();
  const comment = sanitizeComment(input.comment);
  const existing = state.ratings.find((rating) => rating.movieId === input.movieId && rating.userId === input.userId);

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

  await saveAppState(state);
  return state.ratings.find((rating) => rating.movieId === input.movieId && rating.userId === input.userId) as UserRating;
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
  await saveAppState(state);
  return batch;
}

export async function selectWeeklyMovie(batchId: string, movieId: string) {
  const state = await loadAppStateUncached();
  const batch = state.weeklyBatches.find((entry) => entry.id === batchId);
  if (!batch) {
    throw new Error("No se encontro la tanda semanal.");
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

  await saveAppState(state);
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
      await saveAppState(state);
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

  await saveAppState(state);
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

  const changed = await hydrateMovie(state, movie);

  if (state.watchEntries.some((entry) => entry.movieId === movie.id)) {
    if (changed) {
      await saveAppState(state);
    }
    return {
      status: "already_watched" as const,
      movie,
      message: "Esa película ya figura en vuestras vistas."
    };
  }

  if (state.pendingMovieIds.includes(movie.id)) {
    if (changed) {
      await saveAppState(state);
    }
    return {
      status: "already_pending" as const,
      movie,
      message: "Esa película ya está en pendientes."
    };
  }

  state.pendingMovieIds.unshift(movie.id);
  addActivity(state, {
    type: "queued",
    label: `${movie.title} se añadió a pendientes`,
    movieId: movie.id,
    date: new Date().toISOString()
  });

  await saveAppState(state);
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
  await saveAppState(state);

  return {
    status: "removed" as const,
    movie,
    message: "Película quitada de pendientes."
  };
}
