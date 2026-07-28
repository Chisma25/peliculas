import Link from "next/link";
import { notFound } from "next/navigation";

import { MoviePoster } from "@/components/movie-poster";
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

  return (
    <div className="detail-grid">
      <aside className="detail-sidebar">
        <Link
          href={watchEntry ? "/vistas" : "/pendientes"}
          className="detail-back-link detail-back-link-mobile"
        >
          <span aria-hidden="true">←</span>
          {watchEntry ? "Volver a vistas" : "Volver a pendientes"}
        </Link>
        <MoviePoster movie={movie} />
        <section className="panel">
          <p className="eyebrow">Datos clave</p>
          <div className="detail-facts-grid">
            <article className="detail-fact-card">
              <span>Duración</span>
              <strong>{movie.durationMinutes > 0 ? `${movie.durationMinutes} min` : "Pendiente"}</strong>
            </article>
            <article className="detail-fact-card">
              <span>Año</span>
              <strong>{movie.year > 0 ? movie.year : "Pendiente"}</strong>
            </article>
            <article className="detail-fact-card detail-fact-card-wide">
              <span>Idioma original</span>
              <strong>{formatMovieLanguage(movie.language)}</strong>
            </article>
            <article className="detail-fact-card detail-fact-card-wide">
              <span>País</span>
              <strong>{formatMovieCountry(movie.country)}</strong>
            </article>
            <article className="detail-fact-card detail-fact-card-wide detail-fact-card-accent">
              <span>{movie.externalRating.source}</span>
              <strong>{movie.externalRating.value}</strong>
            </article>
          </div>
          <div className="detail-fact-actions">
            {movie.trailerUrl ? (
              <a href={movie.trailerUrl} className="secondary-button" target="_blank" rel="noreferrer">
                Ver tráiler
              </a>
            ) : null}
            {movie.sourceIds?.tmdb ? (
              <a
                href={`https://www.themoviedb.org/movie/${movie.sourceIds.tmdb}`}
                className="secondary-button"
                target="_blank"
                rel="noreferrer"
              >
                Abrir TMDb
              </a>
            ) : null}
          </div>
        </section>
      </aside>

      <section className="panel detail-main-panel">
        <Link href={watchEntry ? "/vistas" : "/pendientes"} className="detail-back-link detail-back-link-desktop">
          <span aria-hidden="true">←</span>
          {watchEntry ? "Volver a vistas" : "Volver a pendientes"}
        </Link>
        <p className="eyebrow">Ficha de película</p>
        <h1 className="detail-title">{movie.title}</h1>
        <div className="detail-meta">
          <span>
            {movie.director} / {movie.genres.join(" / ")}
          </span>
          <strong>{ratings.length > 0 ? `${formatScore(average)} media del grupo` : "Sin notas aún"}</strong>
        </div>
        <p className="body-copy">{movie.synopsis}</p>

        <section className="panel">
          <p className="eyebrow">Contexto</p>
          <p className="body-copy">
            {watchEntry?.watchedOn
              ? `La visteis en grupo el ${formatLongDate(watchEntry.watchedOn)}.`
              : watchEntry
                ? "Figura en vuestras vistas, pero sin fecha registrada."
                : "Todavía no consta como vista por el grupo."}
          </p>
          <div className="chips">
            {movie.cast.length > 0 ? movie.cast.map((member) => <span key={member}>{member}</span>) : <span>Reparto pendiente</span>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <p className="eyebrow">Notas del grupo</p>
            <h2>Valoraciones individuales</h2>
          </div>
          <div className="member-list">
            {ratedMembers.length > 0 ? (
              ratedMembers.map((member) => {
                const rating = ratingByUserId.get(member.id)!;
                return (
                  <article key={member.id} className="member-card">
                    <div className="member-rating-head">
                      <div className="member-rating-user">
                        <UserAvatar user={member} size="sm" />
                        <div className="member-rating-user-copy">
                          <strong>{member.name}</strong>
                          <span>@{member.username}</span>
                        </div>
                      </div>
                      <span className="member-rating-score">{formatScore(rating.score)}</span>
                    </div>
                    <p className="body-copy">{rating.comment ?? "Sin comentario."}</p>
                  </article>
                );
              })
            ) : (
              <div className="detail-ratings-empty">
                <strong>La conversación todavía no ha empezado</strong>
                <p>Nadie ha dejado una nota para esta película.</p>
              </div>
            )}
            {unratedMembers.length > 0 ? (
              <div className="detail-unrated-summary">
                <span>{unratedMembers.length === 1 ? "Falta por valorar" : "Faltan por valorar"}</span>
                <strong>{unratedMembers.map((member) => member.name).join(", ")}</strong>
              </div>
            ) : null}
          </div>
        </section>

        {sessionUser && watchEntry ? (
          <section className="panel">
            <div className="panel-header">
              <p className="eyebrow">Tu nota</p>
              <h2>{myRating ? "Ya tienes una valoración guardada" : "Aún no la has valorado"}</h2>
            </div>
            <p className="body-copy">
              Pulsa el botón para abrir una ventana emergente y guardar tu nota. La nota es obligatoria y el comentario
              es opcional.
            </p>
            <RatingPanel movieId={movie.id} initialScore={myRating?.score} initialComment={myRating?.comment} />
          </section>
        ) : null}
      </section>
    </div>
  );
}
