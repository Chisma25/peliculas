import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { CinematicStage } from "@/components/cinematic-stage";
import { ContextualBackButton } from "@/components/contextual-back-button";
import { DirectionalChapterAssist } from "@/components/directional-chapter-assist";
import { PosterImage } from "@/components/poster-image";
import { RatingPanel } from "@/components/rating-panel";
import { UserAvatar } from "@/components/user-avatar";
import { getMovieDetailDataHydrated, getSessionUser } from "@/lib/store";
import { formatLongDate, formatMovieCountry, formatMovieLanguage, formatScore } from "@/lib/utils";

type MoviePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function MoviePage({ params }: MoviePageProps) {
  const { slug } = await params;
  const sessionUser = await getSessionUser();
  const movieData = await getMovieDetailDataHydrated(slug, sessionUser?.id);
  if (!movieData) {
    notFound();
  }

  const { movie, watchEntry, ratings, members, average, myRating } = movieData;
  const ratingByUserId = new Map(ratings.map((rating) => [rating.userId, rating]));
  const ratedMembers = members.filter((member) => ratingByUserId.has(member.id));
  const unratedMembers = members.filter((member) => !ratingByUserId.has(member.id));
  const artwork = movie.backdrop || movie.posterUrl;
  const fallbackHref = watchEntry ? "/vistas" : "/pendientes";

  return (
    <article className="cinema-detail">
      <DirectionalChapterAssist />

      <CinematicStage className="cinema-detail-hero" labelledBy="movie-title">
        {artwork ? (
          <div className="cinema-detail-backdrop" style={{ backgroundImage: `url(${artwork})` }} aria-hidden="true" />
        ) : null}
        <div className="cinema-detail-shade" />
        <div className="cinema-detail-grain" aria-hidden="true" />

        <ContextualBackButton fallbackHref={fallbackHref} />

        <div className="cinema-detail-title-block">
          <h1 id="movie-title">{movie.title}</h1>
          <p className="cinema-detail-byline">
            Dirección · <strong>{movie.director}</strong>
          </p>
          <div className="cinema-detail-hero-meta">
            <span>{movie.year > 0 ? movie.year : "Año pendiente"}</span>
            <span>{movie.durationMinutes > 0 ? `${movie.durationMinutes} min` : "Duración pendiente"}</span>
            <span>{movie.genres.slice(0, 2).join(" / ") || "Género pendiente"}</span>
          </div>
        </div>

        <div className="cinema-detail-art">
          <figure className="cinema-detail-poster">
            <PosterImage src={movie.posterUrl || movie.backdrop} loading="eager" />
            <figcaption>{movie.title}</figcaption>
          </figure>

          <div className="cinema-detail-score" aria-label={ratings.length > 0 ? `Media del grupo ${formatScore(average)}` : "Sin notas aún"}>
            <span>{ratings.length > 0 ? "Media del grupo" : "Todavía"}</span>
            <strong>{ratings.length > 0 ? formatScore(average) : "—"}</strong>
            <small>{ratings.length > 0 ? `${ratings.length} notas` : "sin notas"}</small>
          </div>
        </div>
      </CinematicStage>

      <section id="la-pelicula" className="cinema-detail-overview" data-scroll-chapter aria-label="Datos y sinopsis de la película">
        <div className="cinema-detail-editorial">
          <aside className="cinema-detail-facts" aria-label="Datos clave">
            <p className="cinema-section-number">Datos clave</p>
            <dl>
              <div>
                <dt>Duración</dt>
                <dd>{movie.durationMinutes > 0 ? `${movie.durationMinutes} min` : "Pendiente"}</dd>
              </div>
              <div>
                <dt>Año</dt>
                <dd>{movie.year > 0 ? movie.year : "Pendiente"}</dd>
              </div>
              <div>
                <dt>Idioma original</dt>
                <dd>{formatMovieLanguage(movie.language)}</dd>
              </div>
              <div>
                <dt>País</dt>
                <dd>{formatMovieCountry(movie.country)}</dd>
              </div>
              <div>
                <dt>Sesión</dt>
                <dd>
                  {watchEntry?.watchedOn
                    ? formatLongDate(watchEntry.watchedOn)
                    : watchEntry
                      ? "Fecha pendiente"
                      : "Aún no vista"}
                </dd>
              </div>
              <div className="cinema-detail-fact-accent">
                <dt>{movie.externalRating.source}</dt>
                <dd>{movie.externalRating.value}</dd>
              </div>
            </dl>

            <div className="cinema-detail-links">
              {movie.trailerUrl ? (
                <a href={movie.trailerUrl} className="cinema-text-link" target="_blank" rel="noreferrer">
                  Ver tráiler <span aria-hidden="true">↗</span>
                </a>
              ) : null}
              {movie.sourceIds?.tmdb ? (
                <a
                  href={`https://www.themoviedb.org/movie/${movie.sourceIds.tmdb}`}
                  className="cinema-text-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir TMDb <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
          </aside>

          <div className="cinema-detail-story">
            <div className="cinema-detail-synopsis">
              <p className="cinema-section-number">Sinopsis</p>
              <p>{movie.synopsis}</p>
            </div>

            <div className="cinema-detail-context">
              <div>
                <p className="cinema-section-number">Reparto principal</p>
                <h3>En pantalla</h3>
              </div>
              <div className="cinema-detail-cast" aria-label="Reparto">
                {movie.cast.length > 0 ? (
                  movie.cast.map((member, index) => (
                    <span key={member}>
                      <small>{String(index + 1).padStart(2, "0")}</small>
                      {member}
                    </span>
                  ))
                ) : (
                  <span>Reparto pendiente</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="valoraciones" className="cinema-detail-community" data-scroll-chapter aria-labelledby="ratings-title">
        <header className="cinema-detail-section-heading cinema-detail-ratings-heading">
          <div>
            <p className="cinema-kicker">El grupo</p>
            <h2 id="ratings-title">Valoraciones</h2>
          </div>
          <div className="cinema-detail-ratings-summary">
            <strong>{ratings.length > 0 ? formatScore(average) : "—"}</strong>
            <span>{ratings.length} valoraciones</span>
          </div>
        </header>

        <div className="cinema-rating-list">
          {ratedMembers.length > 0 ? (
            ratedMembers.map((member, index) => {
              const rating = ratingByUserId.get(member.id)!;
              return (
                <article key={member.id} className="cinema-rating-row" style={{ "--rating-order": index } as CSSProperties}>
                  <span className="cinema-rating-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div className="cinema-rating-person">
                    <UserAvatar user={member} size="sm" />
                    <div>
                      <strong>{member.name}</strong>
                      <span>@{member.username}</span>
                    </div>
                  </div>
                  <blockquote>{rating.comment ?? "Sin comentario."}</blockquote>
                  <strong className="cinema-rating-number">{formatScore(rating.score)}</strong>
                </article>
              );
            })
          ) : (
            <div className="cinema-ratings-empty">
              <strong>Todavía no hay valoraciones</strong>
              <p>Nadie ha dejado una nota para esta película.</p>
            </div>
          )}
        </div>

        {unratedMembers.length > 0 ? (
          <p className="cinema-unrated">
            <span>{unratedMembers.length === 1 ? "Falta por valorar" : "Faltan por valorar"}</span>
            {unratedMembers.map((member) => member.name).join(", ")}
          </p>
        ) : null}

        {sessionUser && watchEntry ? (
          <div className="cinema-detail-your-rating" aria-labelledby="your-rating-title">
            <div>
              <p className="cinema-section-number">Tu nota</p>
              <h2 id="your-rating-title">
                {myRating ? formatScore(myRating.score) : "Sin valorar"}
              </h2>
              <p>
                {myRating
                  ? "Puedes cambiar la nota o añadir un comentario cuando quieras."
                  : "Guarda una nota y, si quieres, añade un comentario."}
              </p>
            </div>
            <RatingPanel movieId={movie.id} initialScore={myRating?.score} initialComment={myRating?.comment} />
          </div>
        ) : null}
      </section>
    </article>
  );
}
