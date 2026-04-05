import Link from "next/link";

import { Movie } from "@/lib/types";
import { getMovieTone } from "@/lib/utils";

type MoviePosterProps = {
  movie: Movie;
  href?: string;
  compact?: boolean;
  showDetails?: boolean;
  showDuration?: boolean;
  metaLabel?: string;
  metaStartLabel?: string;
  metaEndLabel?: string;
};

export function MoviePoster({
  movie,
  href,
  compact = false,
  showDetails = true,
  showDuration = true,
  metaLabel,
  metaStartLabel,
  metaEndLabel
}: MoviePosterProps) {
  const hasImage = Boolean(movie.posterUrl || movie.backdrop);
  const imageUrl = movie.posterUrl || movie.backdrop;
  const content = (
    <article
      className={`poster-card ${compact ? "poster-card-compact" : ""} ${hasImage ? "poster-card-with-image" : ""}`}
      style={
        hasImage
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(8, 12, 20, 0.1), rgba(8, 12, 20, 0.82)), url(${imageUrl})`,
              backgroundColor: getMovieTone(movie),
              backgroundSize: "cover",
              backgroundPosition: "center"
            }
          : { background: getMovieTone(movie) }
      }
    >
      <div className="poster-noise" />
      <div className="poster-meta">
        <span>{metaStartLabel ?? (movie.year > 0 ? movie.year : "Año pendiente")}</span>
        {showDuration ? <span>{metaEndLabel ?? (movie.durationMinutes > 0 ? `${movie.durationMinutes} min` : "Duración pendiente")}</span> : null}
      </div>
      {showDetails ? (
        <div className="poster-bottom">
          <p className="eyebrow">{movie.director}</p>
          <h3>{movie.title}</h3>
          <p>{movie.genres.slice(0, compact ? 1 : 2).join(" / ")}</p>
        </div>
      ) : metaLabel ? (
        <div className="poster-minimal-footer">
          <span>{metaLabel}</span>
        </div>
      ) : null}
    </article>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="poster-link">
      {content}
    </Link>
  );
}
