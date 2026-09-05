import type { AppState, Movie } from "@/lib/types";
import { resolveMovieMetadata, TMDB_METADATA_VERSION } from "@/lib/movie-provider";

export function movieNeedsHydration(movie: Movie) {
  const hasGenres = movie.genres.length > 0 && !movie.genres.every((genre) => genre === "Pendiente");
  const hasDirector = movie.director && movie.director !== "Pendiente";
  const hasSynopsis = movie.synopsis && movie.synopsis !== "Pendiente de enriquecer desde TMDb.";
  const hasDuration = movie.durationMinutes > 0;
  const hasPoster = Boolean(movie.posterUrl);

  const hasCurrentTmdbMetadata =
    !movie.sourceIds?.tmdb || movie.metadataVersion === TMDB_METADATA_VERSION;

  return !(hasGenres && hasDirector && hasSynopsis && hasDuration && hasPoster && hasCurrentTmdbMetadata);
}

export async function hydrateMovie(state: AppState, movie: Movie | null) {
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
