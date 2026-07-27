import { Movie } from "@/lib/types";

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
