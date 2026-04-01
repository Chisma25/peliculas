import { Movie } from "@/lib/types";
import { slugify } from "@/lib/utils";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const TMDB_SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const TMDB_DETAILS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const tmdbMemoryCache = new Map<string, { payload: unknown; expiresAt: number }>();

const TITLE_SEARCH_OVERRIDES: Record<string, { tmdbId?: string; search?: string; year?: number }> = {
  "el-gato-con-botas-el-utilmo-deseo": {
    tmdbId: "315162",
    search: "Puss in Boots: The Last Wish",
    year: 2022
  },
  se7en: {
    tmdbId: "807",
    search: "Se7en",
    year: 1995
  },
  goodfellas: {
    tmdbId: "769",
    search: "GoodFellas",
    year: 1990
  },
  "no-country-for-old-men": {
    tmdbId: "6977",
    search: "No Country for Old Men",
    year: 2007
  },
  "f1-the-movie": {
    tmdbId: "911430",
    search: "F1 The Movie",
    year: 2025
  },
  "catch-me-if-you-can": {
    tmdbId: "640",
    search: "Catch Me If You Can",
    year: 2002
  },
  superbad: {
    tmdbId: "8363",
    search: "Superbad",
    year: 2007
  },
  "top-gun": {
    tmdbId: "744",
    search: "Top Gun",
    year: 1986
  },
  "top-gun-maverick": {
    tmdbId: "361743",
    search: "Top Gun: Maverick",
    year: 2022
  },
  inception: {
    tmdbId: "27205",
    search: "Inception",
    year: 2010
  },
  "fight-club": {
    tmdbId: "550",
    search: "Fight Club",
    year: 1999
  },
  "the-man-from-earth": {
    tmdbId: "13363",
    search: "The Man from Earth",
    year: 2007
  },
  snatch: {
    tmdbId: "107",
    search: "Snatch",
    year: 2000
  },
  arrival: {
    tmdbId: "329865",
    search: "Arrival",
    year: 2016
  },
  nobody: {
    tmdbId: "615457",
    search: "Nobody",
    year: 2021
  },
  "el-camino": {
    tmdbId: "559969",
    search: "El Camino: A Breaking Bad Movie",
    year: 2019
  },
  "once-upon-a-time-in-hollywood": {
    tmdbId: "466272",
    search: "Once Upon a Time... in Hollywood",
    year: 2019
  },
  parasite: {
    search: "Parasite",
    year: 2019
  },
  aftersun: {
    search: "Aftersun",
    year: 2022
  },
  "drive-my-car": {
    search: "Drive My Car",
    year: 2021
  },
  "blade-runner-2049": {
    search: "Blade Runner 2049",
    year: 2017
  },
  "the-holdovers": {
    search: "The Holdovers",
    year: 2023
  },
  "before-sunrise": {
    search: "Before Sunrise",
    year: 1995
  },
  "memories-of-murder": {
    search: "Memories of Murder",
    year: 2003
  },
  "past-lives": {
    search: "Past Lives",
    year: 2023
  },
  "seven-samurai": {
    search: "Seven Samurai",
    year: 1954
  },
  "la-haine": {
    search: "La Haine",
    year: 1995
  },
  "chungking-express": {
    search: "Chungking Express",
    year: 1994
  }
};

const BEHIND_THE_SCENES_MARKERS = [
  "making of",
  "behind the",
  "behind closed doors",
  "behind the camera",
  "featurette",
  "documentary",
  "special"
];

type TmdbSearchResult = {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  release_date?: string;
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  original_language?: string;
};

type TmdbMovieDetails = {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  release_date?: string;
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  spoken_languages?: Array<{ english_name: string; name: string }>;
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  videos?: {
    results?: Array<{
      key: string;
      site: string;
      type: string;
    }>;
  };
  credits?: {
    cast?: Array<{ name: string; order?: number }>;
    crew?: Array<{ name: string; job: string }>;
  };
};

type CachedPayload<T> = {
  hit: boolean;
  data: T | null;
};

function shouldUsePersistentCache() {
  return Boolean(process.env.DATABASE_URL);
}

function buildCacheKey(kind: string, rawKey: string) {
  return `${kind}:${encodeURIComponent(rawKey)}`;
}

function getCacheTtl(kind: string) {
  return kind === "movie-details" ? TMDB_DETAILS_CACHE_TTL_MS : TMDB_SEARCH_CACHE_TTL_MS;
}

function getMemoryCache<T>(kind: string, rawKey: string) {
  const key = buildCacheKey(kind, rawKey);
  const entry = tmdbMemoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    tmdbMemoryCache.delete(key);
    return null;
  }

  return entry.payload as CachedPayload<T>;
}

function setMemoryCache<T>(kind: string, rawKey: string, payload: CachedPayload<T>, ttlMs: number) {
  tmdbMemoryCache.set(buildCacheKey(kind, rawKey), {
    payload,
    expiresAt: Date.now() + ttlMs
  });
}

async function readPersistentCache<T>(kind: string, rawKey: string) {
  if (!shouldUsePersistentCache()) {
    return null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const entry = await prisma.tmdbCacheEntry.findUnique({
      where: {
        key: buildCacheKey(kind, rawKey)
      }
    });

    if (!entry) {
      return null;
    }

    if (entry.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return entry.payload as CachedPayload<T>;
  } catch {
    return null;
  }
}

async function writePersistentCache<T>(kind: string, rawKey: string, payload: CachedPayload<T>, ttlMs: number) {
  if (!shouldUsePersistentCache()) {
    return;
  }

  const jsonPayload = JSON.parse(JSON.stringify(payload));

  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.tmdbCacheEntry.upsert({
      where: {
        key: buildCacheKey(kind, rawKey)
      },
      create: {
        key: buildCacheKey(kind, rawKey),
        kind,
        payload: jsonPayload,
        expiresAt: new Date(Date.now() + ttlMs)
      },
      update: {
        kind,
        payload: jsonPayload,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });
  } catch {
    // Fallback silencioso: si la cache persistente falla, la app sigue funcionando.
  }
}

async function readCachedPayload<T>(kind: string, rawKey: string) {
  const memoryPayload = getMemoryCache<T>(kind, rawKey);
  if (memoryPayload) {
    return memoryPayload;
  }

  const persistentPayload = await readPersistentCache<T>(kind, rawKey);
  if (persistentPayload) {
    setMemoryCache(kind, rawKey, persistentPayload, getCacheTtl(kind));
  }

  return persistentPayload;
}

async function writeCachedPayload<T>(kind: string, rawKey: string, payload: CachedPayload<T>, ttlMs: number) {
  setMemoryCache(kind, rawKey, payload, ttlMs);
  await writePersistentCache(kind, rawKey, payload, ttlMs);
}

function buildImageUrl(path?: string | null, size = "w780") {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : undefined;
}

function getSearchOverride(movieOrTitle: Movie | string) {
  const title = typeof movieOrTitle === "string" ? movieOrTitle : movieOrTitle.title;
  return TITLE_SEARCH_OVERRIDES[slugify(title)];
}

function normalizeTitle(value: string) {
  return slugify(value).replace(/-/g, " ");
}

function isBehindTheScenesTitle(candidateTitle: string, query: string) {
  const normalizedTitle = normalizeTitle(candidateTitle);
  const normalizedQuery = normalizeTitle(query);
  const queryExplicitlyRequestsExtra = BEHIND_THE_SCENES_MARKERS.some((marker) => normalizedQuery.includes(marker));

  if (queryExplicitlyRequestsExtra) {
    return false;
  }

  return BEHIND_THE_SCENES_MARKERS.some((marker) => normalizedTitle.includes(marker));
}

async function tmdbFetch<T>(path: string) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return null;
  }

  const separator = path.includes("?") ? "&" : "?";

  try {
    const response = await fetch(`${TMDB_BASE_URL}${path}${separator}api_key=${apiKey}&language=es-ES`, {
      next: {
        revalidate: 43200
      }
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function mapSearchResultToMovie(item: TmdbSearchResult): Movie {
  return {
    id: `tmdb_${item.id}`,
    slug: slugify(item.title),
    title: item.title,
    year: Number.parseInt(item.release_date?.slice(0, 4) ?? "0", 10) || 0,
    synopsis: item.overview || "Sinopsis pendiente de enriquecimiento.",
    durationMinutes: 120,
    genres: ["Pendiente"],
    director: "Pendiente",
    cast: [],
    language: item.original_language?.toUpperCase() || "Desconocido",
    country: "Desconocido",
    posterUrl: buildImageUrl(item.poster_path, "w500"),
    backdrop: buildImageUrl(item.backdrop_path, "w780"),
    externalRating: {
      source: "TMDb",
      value: `${Math.round((item.vote_average ?? 0) * 10)}%`
    },
    sourceIds: {
      tmdb: String(item.id)
    }
  };
}

function mapDetailsToMovie(item: TmdbMovieDetails): Movie {
  const director = item.credits?.crew?.find((member) => member.job === "Director")?.name ?? "Pendiente";
  const cast =
    item.credits?.cast
      ?.sort((left, right) => (left.order ?? 99) - (right.order ?? 99))
      .slice(0, 5)
      .map((member) => member.name) ?? [];
  const trailer = item.videos?.results?.find((video) => video.site === "YouTube" && video.type === "Trailer");

  return {
    id: `tmdb_${item.id}`,
    slug: slugify(item.title),
    title: item.title,
    year: Number.parseInt(item.release_date?.slice(0, 4) ?? "0", 10) || 0,
    synopsis: item.overview || "Sinopsis pendiente de enriquecimiento.",
    durationMinutes: item.runtime || 120,
    genres: item.genres?.map((genre) => genre.name) ?? ["Pendiente"],
    director,
    cast,
    language: item.spoken_languages?.[0]?.name || item.spoken_languages?.[0]?.english_name || "Desconocido",
    country: item.production_countries?.[0]?.name || "Desconocido",
    trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : undefined,
    posterUrl: buildImageUrl(item.poster_path, "w500"),
    backdrop: buildImageUrl(item.backdrop_path, "w780"),
    externalRating: {
      source: "TMDb",
      value: `${Math.round((item.vote_average ?? 0) * 10)}%`
    },
    sourceIds: {
      tmdb: String(item.id)
    }
  };
}

function mergeMovies(primary: Movie, fallback?: Movie | null): Movie {
  if (!fallback) {
    return primary;
  }

  return {
    ...fallback,
    ...primary,
    sourceIds: {
      ...fallback.sourceIds,
      ...primary.sourceIds
    },
    externalRating: primary.externalRating ?? fallback.externalRating
  };
}

function titleSimilarity(query: string, candidate: Movie, year?: number) {
  const normalizedQuery = slugify(query);
  const exact = candidate.slug === normalizedQuery ? 100 : 0;
  const contains = candidate.slug.includes(normalizedQuery) || normalizedQuery.includes(candidate.slug) ? 25 : 0;
  const yearScore = year && candidate.year === year ? 35 : 0;
  const extraPenalty = isBehindTheScenesTitle(candidate.title, query) ? 120 : 0;
  return exact + contains + yearScore - extraPenalty;
}

async function fetchMovieByTmdbId(tmdbId: string) {
  const cached = await readCachedPayload<TmdbMovieDetails>("movie-details", tmdbId);
  if (cached) {
    return cached.hit && cached.data ? mapDetailsToMovie(cached.data) : null;
  }

  const details = await tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}?append_to_response=credits,videos`);
  await writeCachedPayload("movie-details", tmdbId, { hit: Boolean(details), data: details ?? null }, TMDB_DETAILS_CACHE_TTL_MS);
  return details ? mapDetailsToMovie(details) : null;
}

async function fetchSearchResults(query: string) {
  const cacheKey = query.trim().toLocaleLowerCase("es");
  const cached = await readCachedPayload<TmdbSearchResult[]>("movie-search", cacheKey);
  if (cached) {
    return cached.hit && cached.data ? cached.data.filter((item) => !isBehindTheScenesTitle(item.title, query)).map(mapSearchResultToMovie) : [];
  }

  const payload = await tmdbFetch<{ results?: TmdbSearchResult[] }>(`/search/movie?query=${encodeURIComponent(query)}`);
  const results = payload?.results ?? [];
  await writeCachedPayload("movie-search", cacheKey, { hit: results.length > 0, data: results }, TMDB_SEARCH_CACHE_TTL_MS);

  return results.filter((item) => !isBehindTheScenesTitle(item.title, query)).map(mapSearchResultToMovie);
}

export async function searchMovies(query: string, fallbackMovies: Movie[]) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const localMatches = fallbackMovies.filter((movie) => movie.title.toLowerCase().includes(trimmed.toLowerCase()));
  const remoteMatches = (await fetchSearchResults(trimmed)).slice(0, 8);
  return [...remoteMatches, ...localMatches].slice(0, 10);
}

export async function findMovieCandidates(query: string, year: number | undefined, fallbackMovies: Movie[]) {
  const override = getSearchOverride(query);
  const effectiveQuery = override?.search ?? query;
  const effectiveYear = override?.year ?? year;

  const localMatches = fallbackMovies.filter((movie) => {
    const sameYear = effectiveYear ? movie.year === effectiveYear : true;
    const normalizedTitle = slugify(effectiveQuery);
    return sameYear && (movie.slug === normalizedTitle || movie.slug.includes(normalizedTitle) || normalizedTitle.includes(movie.slug));
  });

  const remoteMatches = (await fetchSearchResults(effectiveQuery)).slice(0, 5);

  const deduped = [...localMatches];
  for (const remote of remoteMatches) {
    if (!deduped.some((existing) => existing.slug === remote.slug && existing.year === remote.year)) {
      deduped.push(remote);
    }
  }

  return deduped
    .sort((left, right) => titleSimilarity(effectiveQuery, right, effectiveYear) - titleSimilarity(effectiveQuery, left, effectiveYear))
    .slice(0, 5);
}

export async function enrichMovieCandidate(movie: Movie) {
  const tmdbId = movie.sourceIds?.tmdb;
  if (!tmdbId) {
    return movie;
  }

  const details = await fetchMovieByTmdbId(tmdbId);
  if (!details) {
    return movie;
  }

  return mergeMovies(details, movie);
}

export async function resolveMovieMetadata(movie: Movie) {
  const override = getSearchOverride(movie);

  if (override?.tmdbId) {
    const exactMovie = await fetchMovieByTmdbId(override.tmdbId);
    if (exactMovie) {
      return mergeMovies(exactMovie, movie);
    }
  }

  if (movie.sourceIds?.tmdb) {
    return enrichMovieCandidate(movie);
  }

  const effectiveQuery = override?.search ?? movie.title;
  const effectiveYear = override?.year ?? (movie.year || undefined);
  const searchResults = (await fetchSearchResults(effectiveQuery)).slice(0, 5);
  const bestMatch = searchResults.sort(
    (left, right) => titleSimilarity(effectiveQuery, right, effectiveYear) - titleSimilarity(effectiveQuery, left, effectiveYear)
  )[0];

  if (!bestMatch) {
    return movie;
  }

  return enrichMovieCandidate(mergeMovies(bestMatch, movie));
}
