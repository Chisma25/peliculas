import type { Movie } from "@/lib/types";

type MovieDetailArtwork = {
  backdrop?: string;
  poster?: string;
  usesPosterFallback: boolean;
};

export function getMovieDetailArtwork(movie: Movie): MovieDetailArtwork {
  const poster = movie.posterUrl || movie.backdrop;
  const hasDedicatedBackdrop = Boolean(movie.backdrop && (!movie.posterUrl || movie.backdrop !== movie.posterUrl));

  if (hasDedicatedBackdrop) {
    return {
      backdrop: movie.backdrop,
      poster,
      usesPosterFallback: false
    };
  }

  return {
    backdrop: movie.backdrop || poster,
    poster,
    usesPosterFallback: Boolean(poster)
  };
}
