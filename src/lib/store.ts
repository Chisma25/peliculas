import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

import { cookies } from "next/headers";

import { seedState } from "@/lib/demo-data";
import { loadManualHistorySeed } from "@/lib/manual-history";
import { resolveMovieMetadata, searchMovies } from "@/lib/movie-provider";
import { generateWeeklyRecommendations } from "@/lib/recommendations";
import { ActivityItem, AppState, Movie, User, UserRating } from "@/lib/types";
import { average, getMovieAverage, safeId, slugify } from "@/lib/utils";

const SESSION_COOKIE = "cine.session";
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

const REMOVED_TEST_USERNAMES = new Set(["xisma25"]);
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
      const shouldRemove = REMOVED_TEST_USERNAMES.has(normalizeUsername(user.username || user.name || ""));
      if (shouldRemove) {
        removedUserIds.add(user.id);
      }
      return !shouldRemove;
    })
    .map((user) => ensureUserCredentials(user));
  const memberIds = source.group.memberIds.filter((memberId) => users.some((user) => user.id === memberId));
  const missingMemberIds = users.map((user) => user.id).filter((userId) => !memberIds.includes(userId));

  return {
    ...source,
    ratings: source.ratings.filter((rating) => !removedUserIds.has(rating.userId)),
    users,
    group: {
      ...source.group,
      memberIds: [...memberIds, ...missingMemberIds]
    },
    activity: source.activity.filter((entry) => !entry.userId || !removedUserIds.has(entry.userId))
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

async function loadAppState() {
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
  return SESSION_COOKIE;
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
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
  return getCurrentBatchFromState(state);
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
  const recommendations =
    batch?.items
      .map((item) => {
        const movie = getMovieById(state, item.movieId);
        if (!movie) {
          return null;
        }

        return {
          ...item,
          movie,
          selected: batch.selectedMovieId === movie.id
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)) ?? [];

  return {
    group: state.group,
    members: listMembersFromState(state),
    pendingMovies: listPendingFromState(state),
    recommendations,
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
  const recommendations =
    batch?.items
      .map((item) => {
        const movie = getMovieById(state, item.movieId);
        if (!movie) {
          return null;
        }

        return {
          ...item,
          movie,
          selected: batch.selectedMovieId === movie.id
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)) ?? [];

  const pendingMovies = listPendingFromState(state);
  const selectedMovie = batch?.selectedMovieId ? getMovieById(state, batch.selectedMovieId) : null;
  const hydrated = await Promise.all([
    ...recommendations.map((item) => hydrateMovie(state, item.movie)),
    ...pendingMovies.map((movie) => hydrateMovie(state, movie)),
    hydrateMovie(state, selectedMovie)
  ]);

  if (hydrated.some(Boolean)) {
    await saveAppState(state);
  }

  return {
    group: state.group,
    members: listMembersFromState(state),
    pendingMovies: listPendingFromState(state),
    recommendations,
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

export async function authenticateUser(username: string, password: string) {
  const state = await loadAppState();
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
  }
) {
  const state = await loadAppState();
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
  if (input.password?.trim()) {
    user.passwordHash = hashPassword(input.password.trim());
  }

  addActivity(state, {
    type: "rated",
    label: previousName === nextName ? `${nextName} actualizo su perfil` : `${previousName} ahora aparece como ${nextName}`,
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
  const state = await loadAppState();
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

  const usernameTaken = state.users.some(
    (entry) => entry.id !== targetUser.id && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
  );
  if (usernameTaken) {
    throw new Error("Ese usuario ya lo esta usando otra persona.");
  }

  const previousUsername = targetUser.username;
  targetUser.username = nextUsername;

  if (nextPassword) {
    targetUser.passwordHash = hashPassword(nextPassword);
  }

  addActivity(state, {
    type: "rated",
    label:
      previousUsername === nextUsername
        ? `${adminUser.name} actualizo el acceso de ${targetUser.name}`
        : `${adminUser.name} cambio el usuario de ${targetUser.name} a @${nextUsername}`,
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

  const state = await loadAppState();
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
    label: `Se restablecio el acceso de ${user.name}`,
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
  const state = await loadAppState();
  const existing = state.ratings.find((rating) => rating.movieId === input.movieId && rating.userId === input.userId);

  if (existing) {
    existing.score = input.score;
    existing.comment = input.comment;
  } else {
    state.ratings.push({
      id: safeId("rating", `${input.movieId}-${input.userId}`),
      movieId: input.movieId,
      userId: input.userId,
      score: input.score,
      comment: input.comment
    });
  }

  const user = findUserById(state, input.userId);
  const movie = getMovieById(state, input.movieId);
  if (user && movie) {
    addActivity(state, {
      type: "rated",
      label: `${user.name} puntuo ${movie.title} con un ${input.score.toFixed(1)}`,
      movieId: movie.id,
      userId: user.id,
      date: new Date().toISOString()
    });
  }

  await saveAppState(state);
  return state.ratings.find((rating) => rating.movieId === input.movieId && rating.userId === input.userId) as UserRating;
}

export async function generateBatch() {
  const state = await loadAppState();
  const batch = generateWeeklyRecommendations(state);
  state.weeklyBatches.unshift(batch);
  addActivity(state, {
    type: "recommended",
    label: "Se genero una nueva tanda de recomendaciones para esta semana",
    date: batch.createdAt
  });
  await saveAppState(state);
  return batch;
}

export async function selectWeeklyMovie(batchId: string, movieId: string) {
  const state = await loadAppState();
  const batch = state.weeklyBatches.find((entry) => entry.id === batchId);
  if (!batch) {
    throw new Error("No se encontro la tanda semanal.");
  }

  batch.selectedMovieId = movieId;
  const movie = getMovieById(state, movieId);
  if (movie) {
    addActivity(state, {
      type: "recommended",
      label: `La pelicula de la semana paso a ser ${movie.title}`,
      movieId: movie.id,
      date: new Date().toISOString()
    });
  }

  await saveAppState(state);
  return batch;
}

export async function markMovieAsWatched(movieId: string, watchedOn = new Date().toISOString()) {
  const state = await loadAppState();
  const movie = getMovieById(state, movieId);
  if (!movie) {
    throw new Error("No se encontro la pelicula.");
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
    label: `${movie.title} paso a vistas del grupo`,
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
  const state = await loadAppState();
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
      message: "Esa pelicula ya figura en vuestras vistas."
    };
  }

  if (state.pendingMovieIds.includes(movie.id)) {
    if (changed) {
      await saveAppState(state);
    }
    return {
      status: "already_pending" as const,
      movie,
      message: "Esa pelicula ya esta en pendientes."
    };
  }

  state.pendingMovieIds.unshift(movie.id);
  addActivity(state, {
    type: "queued",
    label: `${movie.title} se anadio a pendientes`,
    movieId: movie.id,
    date: new Date().toISOString()
  });

  await saveAppState(state);
  return {
    status: "added" as const,
    movie,
    message: "Pelicula anadida a pendientes."
  };
}

export async function removePendingMovie(movieId: string) {
  const state = await loadAppState();
  const movie = getMovieById(state, movieId);
  if (!movie) {
    throw new Error("No se encontro la pelicula.");
  }

  if (!state.pendingMovieIds.includes(movieId)) {
    return {
      status: "not_pending" as const,
      movie,
      message: "Esa pelicula ya no estaba en pendientes."
    };
  }

  state.pendingMovieIds = state.pendingMovieIds.filter((pendingMovieId) => pendingMovieId !== movieId);
  addActivity(state, {
    type: "queued",
    label: `${movie.title} se quito de pendientes`,
    movieId: movie.id,
    date: new Date().toISOString()
  });
  await saveAppState(state);

  return {
    status: "removed" as const,
    movie,
    message: "Pelicula quitada de pendientes."
  };
}
