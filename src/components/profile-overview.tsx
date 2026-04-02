import Link from "next/link";

import { MoviePoster } from "@/components/movie-poster";
import { Movie, User, UserRating } from "@/lib/types";
import { formatScore } from "@/lib/utils";

type HydratedProfile = {
  user: User;
  ratingsCount: number;
  averageScore: number;
  topThree: Array<UserRating & { movie: Movie }>;
  bottomThree: Array<UserRating & { movie: Movie }>;
  bestScore: number;
  distribution: Array<{
    value: number;
    label: string;
    count: number;
    ratio: number;
    axisLabel: string;
  }>;
};

type ProfileOverviewProps = {
  profile: HydratedProfile;
  mode?: "self" | "group";
};

export function ProfileOverview({ profile, mode = "self" }: ProfileOverviewProps) {
  const isSelf = mode === "self";
  const averageMarker = Math.max(0, Math.min(100, (profile.averageScore / 10) * 100));
  const dominantBand = [...profile.distribution].sort((left, right) => right.count - left.count || right.value - left.value)[0];
  const occupiedBands = profile.distribution.filter((item) => item.count > 0).length;

  return (
    <div className="profile-grid">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">{isSelf ? "Resumen personal" : "Perfil del grupo"}</p>
          <h1>{isSelf ? "Tu perfil cinéfilo" : profile.user.name}</h1>
        </div>

        <div className="stat-grid profile-stat-grid">
          <article className="stat-card">
            <p className="eyebrow">Valoración media</p>
            <strong>{profile.ratingsCount > 0 ? formatScore(profile.averageScore) : "-"}</strong>
            <p className="body-copy">{isSelf ? "La nota media que sueles poner." : "La nota media que suele poner."}</p>
          </article>

          <article className="stat-card">
            <p className="eyebrow">{isSelf ? "Tu mejor nota" : "Su mejor nota"}</p>
            <strong>{profile.ratingsCount > 0 ? formatScore(profile.bestScore) : "-"}</strong>
            <p className="body-copy">
              {isSelf ? "La puntuación más alta que has puesto." : "La puntuación más alta que ha puesto."}
            </p>
          </article>

          <article className="stat-card">
            <p className="eyebrow">Notas registradas</p>
            <strong>{profile.ratingsCount}</strong>
            <p className="body-copy">
              {isSelf ? "Películas que ya has puntuado dentro del grupo." : "Películas que ya ha puntuado dentro del grupo."}
            </p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="top-picks-layout">
          <div className="top-picks-column">
            <div className="panel-header">
              <p className="eyebrow">{isSelf ? "Tu top 3" : "Su top 3"}</p>
              <h2>{isSelf ? "Tus mejor valoradas" : "Sus mejor valoradas"}</h2>
            </div>

            {profile.topThree.length > 0 ? (
              <div className="top-three-grid">
                {profile.topThree.map((item, index) => (
                  <Link key={item.id} href={`/peliculas/${item.movie.slug}`} className="history-card-link">
                    <article className="top-poster-card">
                      <MoviePoster movie={item.movie} compact showDetails={false} showDuration={false} />
                      <div className="top-poster-rank">#{index + 1}</div>
                      <div className="top-poster-score">{formatScore(item.score)}</div>
                    </article>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p className="body-copy">{isSelf ? "Todavía no has valorado películas." : "Todavía no ha valorado películas."}</p>
              </div>
            )}
          </div>

          <div className="top-picks-column">
            <div className="panel-header">
              <p className="eyebrow">{isSelf ? "Tu bottom 3" : "Su bottom 3"}</p>
              <h2>{isSelf ? "Tus peor valoradas" : "Sus peor valoradas"}</h2>
            </div>

            {profile.bottomThree.length > 0 ? (
              <div className="top-three-grid">
                {profile.bottomThree.map((item, index) => (
                  <Link key={item.id} href={`/peliculas/${item.movie.slug}`} className="history-card-link">
                    <article className="top-poster-card">
                      <MoviePoster movie={item.movie} compact showDetails={false} showDuration={false} />
                      <div className="top-poster-rank">#{index + 1}</div>
                      <div className="top-poster-score top-poster-score-muted">{formatScore(item.score)}</div>
                    </article>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p className="body-copy">{isSelf ? "Todavía no has valorado películas." : "Todavía no ha valorado películas."}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">Distribución de notas</p>
          <h2>Cómo puntúas</h2>
        </div>
        <p className="body-copy">
          {isSelf
            ? "Tu distribución real en intervalos de 0,5 puntos, con la media marcada sobre el eje."
            : "Su distribución real en intervalos de 0,5 puntos, con la media marcada sobre el eje."}
        </p>

        <div className="rating-distribution-shell">
          <div className="rating-distribution-summary">
            <article className="rating-distribution-stat">
              <small>Media</small>
              <strong>{profile.ratingsCount > 0 ? formatScore(profile.averageScore) : "-"}</strong>
            </article>
            <article className="rating-distribution-stat">
              <small>Tramo dominante</small>
              <strong>{dominantBand?.count ? dominantBand.label : "-"}</strong>
            </article>
            <article className="rating-distribution-stat">
              <small>Tramos activos</small>
              <strong>{occupiedBands}</strong>
            </article>
          </div>

          <div className="rating-distribution-frame">
            <div className="rating-distribution-grid" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>

            <div className="rating-distribution-average" style={{ left: `${averageMarker}%` }}>
              <span />
              <small>Media {formatScore(profile.averageScore)}</small>
            </div>

            <div className="rating-distribution-columns">
              {profile.distribution.map((item) => (
                <div key={item.label} className="rating-distribution-column" title={`${item.label}: ${item.count} notas`}>
                  <div className="rating-distribution-count">{item.count > 0 ? item.count : ""}</div>
                  <div className="rating-distribution-track">
                    <div
                      className={`rating-distribution-bar ${item.count > 0 ? "rating-distribution-bar-active" : ""}`}
                      style={{ height: `${Math.max(item.ratio * 100, item.count > 0 ? 10 : 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rating-distribution-axis">
            {profile.distribution.map((item) => (
              <span key={item.label}>{item.axisLabel}</span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
