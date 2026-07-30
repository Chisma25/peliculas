import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { CinematicStage } from "@/components/cinematic-stage";
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

  return (
    <article className="cinema-detail">
      <CinematicStage className="cinema-detail-hero" labelledBy="movie-title">
        {artwork ? (
          <div className="cinema-detail-backdrop" style={{ backgroundImage: `url(${artwork})` }} aria-hidden="true" />
        ) : null}
        <div className="cinema-detail-shade" />
        <div className="cinema-detail-grain" aria-hidden="true" />

        <Link href={watchEntry ? "/vistas" : "/pendientes"} className="cinema-detail-back">
          <span aria-hidden="true">←</span>
          {watchEntry ? "Volver a vistas" : "Volver a pendientes"}
        </Link>

        <div className="cinema-detail-title-block">
          <p className="cinema-kicker">Ficha de película</p>
          <h1 id="movie-title">{movie.title}</h1>
          <p className="cinema-detail-byline">
            Una película de <strong>{movie.director}</strong>
          </p>
          <div className="cinema-detail-hero-meta">
            <span>{movie.year > 0 ? movie.year : "Año pendiente"}</span>
            <span>{movie.durationMinutes > 0 ? `${movie.durationMinutes} min` : "Duración pendiente"}</span>
            <span>{movie.genres.slice(0, 2).join(" / ") || "Género pendiente"}</span>
          </div>
        </div>

        <figure className="cinema-detail-poster">
          <PosterImage src={movie.posterUrl || movie.backdrop} loading="eager" />
          <figcaption>{movie.title}</figcaption>
        </figure>

        <div className="cinema-detail-score" aria-label={ratings.length > 0 ? `Media del grupo ${formatScore(average)}` : "Sin notas aún"}>
          <span>{ratings.length > 0 ? "Media del grupo" : "Todavía"}</span>
          <strong>{ratings.length > 0 ? formatScore(average) : "—"}</strong>
          <small>{ratings.length > 0 ? `${ratings.length} notas` : "sin notas"}</small>
        </div>
      </CinematicStage>

      <div className="cinema-detail-editorial">
        <aside className="cinema-detail-facts" aria-label="Datos clave">
          <p className="cinema-kicker">Datos clave</p>
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
          <section className="cinema-detail-synopsis" aria-labelledby="synopsis-title">
            <p className="cinema-section-number">01 / La película</p>
            <h2 id="synopsis-title">La historia</h2>
            <p>{movie.synopsis}</p>
          </section>

          <section className="cinema-detail-context" aria-labelledby="context-title">
            <div>
              <p className="cinema-section-number">02 / La sesión</p>
              <h2 id="context-title">En vuestro archivo</h2>
            </div>
            <p>
              {watchEntry?.watchedOn
                ? `La visteis en grupo el ${formatLongDate(watchEntry.watchedOn)}.`
                : watchEntry
                  ? "Figura en vuestras vistas, pero sin fecha registrada."
                  : "Todavía no consta como vista por el grupo."}
            </p>
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
          </section>

          <section className="cinema-detail-ratings" aria-labelledby="ratings-title">
            <header>
              <div>
                <p className="cinema-section-number">03 / Después de verla</p>
                <h2 id="ratings-title">Lo que quedó en el grupo</h2>
              </div>
              <span>{ratings.length} valoraciones</span>
            </header>

            <div className="cinema-rating-list">
              {ratedMembers.length > 0 ? (
                ratedMembers.map((member, index) => {
                  const rating = ratingByUserId.get(member.id)!;
                  return (
                    <article key={member.id} className="cinema-rating-row" style={{ "--rating-order": index } as CSSProperties}>
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
                  <strong>La conversación todavía no ha empezado</strong>
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
          </section>

          {sessionUser && watchEntry ? (
            <section className="cinema-detail-your-rating" aria-labelledby="your-rating-title">
              <div>
                <p className="cinema-section-number">04 / Tu valoración</p>
                <h2 id="your-rating-title">
                  {myRating ? "Tu impresión ya forma parte de la sesión" : "¿Qué te pareció?"}
                </h2>
                <p>
                  {myRating
                    ? `Ahora mismo figura con un ${formatScore(myRating.score)}. Puedes cambiarla cuando quieras.`
                    : "Guarda tu nota y, si quieres, una frase para recordar qué te dejó la película."}
                </p>
              </div>
              <RatingPanel movieId={movie.id} initialScore={myRating?.score} initialComment={myRating?.comment} />
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}
