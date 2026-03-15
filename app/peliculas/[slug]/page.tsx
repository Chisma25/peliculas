import { notFound } from "next/navigation";

import { MoviePoster } from "@/components/movie-poster";
import { RatingPanel } from "@/components/rating-panel";
import { UserAvatar } from "@/components/user-avatar";
import { getMovieBySlugHydrated, getRatingsForMovie, getSessionUser, getWatchEntryForMovie, listMembers } from "@/lib/store";
import { formatLongDate, formatScore, getMovieAverage } from "@/lib/utils";

type MoviePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function MoviePage({ params }: MoviePageProps) {
  const { slug } = await params;
  const movie = await getMovieBySlugHydrated(slug);
  if (!movie) {
    notFound();
  }

  const sessionUser = await getSessionUser();
  const [watchEntry, ratings, members] = await Promise.all([
    getWatchEntryForMovie(movie.id),
    getRatingsForMovie(movie.id),
    listMembers()
  ]);
  const average = getMovieAverage(movie.id, ratings);
  const myRating = sessionUser ? ratings.find((rating) => rating.userId === sessionUser.id) : null;

  return (
    <div className="detail-grid">
      <aside className="detail-sidebar">
        <MoviePoster movie={movie} />
        <section className="panel">
          <p className="eyebrow">Datos clave</p>
          <div className="chips">
            <span>{movie.durationMinutes > 0 ? `${movie.durationMinutes} min` : "Duración pendiente"}</span>
            <span>{movie.year > 0 ? movie.year : "Año pendiente"}</span>
            <span>{movie.language}</span>
            <span>{movie.country}</span>
            <span>
              {movie.externalRating.source}: {movie.externalRating.value}
            </span>
          </div>
          {movie.trailerUrl ? (
            <a href={movie.trailerUrl} className="secondary-button" target="_blank" rel="noreferrer">
              Ver trailer
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
        </section>
      </aside>

        <section className="panel">
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
            {members.map((member) => {
              const rating = ratings.find((entry) => entry.userId === member.id);
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
                    <span className="member-rating-score">{rating ? formatScore(rating.score) : "Sin nota"}</span>
                  </div>
                  <p className="body-copy">{rating?.comment ?? "Aún no ha dejado comentario."}</p>
                </article>
              );
            })}
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
            <RatingPanel
              movieId={movie.id}
              initialScore={myRating?.score}
              initialComment={myRating?.comment}
            />
          </section>
        ) : null}
      </section>
    </div>
  );
}
