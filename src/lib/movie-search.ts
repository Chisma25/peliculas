import { Movie } from "@/lib/types";
import { slugify } from "@/lib/utils";

function canonicalMovieKey(movie: Movie) {
  const tmdbId = movie.sourceIds?.tmdb?.trim();
  return tmdbId ? `tmdb:${tmdbId}` : `title:${movie.slug}:${movie.year}`;
}

function hasUsefulGenres(movie: Movie) {
  return movie.genres.some((genre) => genre.trim() && genre.trim().toLowerCase() !== "pendiente");
}

function mergeSearchMovie(preferred: Movie, fallback: Movie): Movie {
  return {
    ...fallback,
    ...preferred,
    cast: preferred.cast.length > 0 ? preferred.cast : fallback.cast,
    director: preferred.director !== "Pendiente" ? preferred.director : fallback.director,
    genres: hasUsefulGenres(preferred) ? preferred.genres : fallback.genres,
    synopsis:
      preferred.synopsis && preferred.synopsis !== "Sinopsis pendiente de enriquecimiento."
        ? preferred.synopsis
        : fallback.synopsis,
    sourceIds: {
      ...fallback.sourceIds,
      ...preferred.sourceIds
    }
  };
}

export function dedupeMovieSearchResults(remoteMatches: Movie[], localMatches: Movie[], limit = 10) {
  const results: Movie[] = [];
  const indexByKey = new Map<string, number>();

  for (const movie of remoteMatches) {
    const key = canonicalMovieKey(movie);
    if (indexByKey.has(key)) {
      continue;
    }
    indexByKey.set(key, results.length);
    results.push(movie);
  }

  for (const movie of localMatches) {
    const key = canonicalMovieKey(movie);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, results.length);
      results.push(movie);
      continue;
    }

    results[existingIndex] = mergeSearchMovie(movie, results[existingIndex]);
  }

  return results.slice(0, limit);
}

function getExternalRating(movie: Movie) {
  const numericRating = Number.parseInt(movie.externalRating.value.replace(/\D/g, ""), 10);
  return Number.isFinite(numericRating) ? numericRating : 0;
}

function getSearchRelevance(query: string, movie: Movie) {
  const normalizedQuery = slugify(query);
  const normalizedTitle = slugify(movie.title);
  const exactTitle = normalizedTitle === normalizedQuery ? 1_000 : 0;
  const startsWithTitle = normalizedTitle.startsWith(normalizedQuery) ? 240 : 0;
  const containsTitle = normalizedTitle.includes(normalizedQuery) ? 100 : 0;
  const posterQuality = movie.posterUrl ? 18 : 0;
  const synopsisQuality = movie.synopsis && !movie.synopsis.toLowerCase().includes("pendiente") ? 12 : 0;
  const yearQuality = movie.year > 0 ? 8 : 0;
  const audienceSignal = Math.min(getExternalRating(movie), 100) / 20;

  return exactTitle + startsWithTitle + containsTitle + posterQuality + synopsisQuality + yearQuality + audienceSignal;
}

export function rankMovieSearchResults(query: string, movies: Movie[]) {
  return movies
    .map((movie, index) => ({ movie, index, relevance: getSearchRelevance(query, movie) }))
    .sort((left, right) => right.relevance - left.relevance || left.index - right.index)
    .map(({ movie }) => movie);
}

export function findStoredMovieForSearchResult(searchResult: Movie, storedMovies: Movie[]) {
  const tmdbId = searchResult.sourceIds?.tmdb?.trim();
  if (tmdbId) {
    return storedMovies.find((movie) => movie.sourceIds?.tmdb?.trim() === tmdbId);
  }

  return storedMovies.find((movie) => movie.slug === searchResult.slug && movie.year === searchResult.year);
}
