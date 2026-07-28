import Link from "next/link";

import { MoviePoster } from "@/components/movie-poster";
import { Movie, User, UserRating } from "@/lib/types";
import { formatCount, formatScore } from "@/lib/utils";

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
  const hasEnoughForExtremes = profile.ratingsCount >= 6;
  const earlyRatings = [...profile.topThree, ...profile.bottomThree]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.movie.id === item.movie.id) === index)
    .slice(0, 3);
  const averageMarker = Math.max(0, Math.min(100, (profile.averageScore / 10) * 100));
  const dominantBand = [...profile.distribution].sort((left, right) => right.count - left.count || right.value - left.value)[0];
  const occupiedBands = profile.distribution.filter((item) => item.count > 0).length;
  const title = isSelf ? "Tu perfil" : profile.user.name;
  const subtitle = isSelf
    ? "Lectura personal de tus notas, tus extremos y tu forma de valorar dentro del grupo."
    : `Lectura de cómo puntúa ${profile.user.name} dentro del grupo.`;

  return (
    <div className="profile-overview">
      <section className="profile-command-panel" aria-labelledby="profile-title">
        <div className="profile-command-copy">
          <p className="eyebrow">{isSelf ? "Resumen personal" : "Perfil del grupo"}</p>
          <h1 id="profile-title">{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="profile-command-ledger" aria-label="Resumen de puntuaciones">
          <article>
            <span>Media</span>
            <strong>{profile.ratingsCount > 0 ? formatScore(profile.averageScore) : "-"}</strong>
            <small>{formatCount(profile.ratingsCount, "nota")}</small>
          </article>
          <article>
            <span>Techo</span>
            <strong>{profile.ratingsCount > 0 ? formatScore(profile.bestScore) : "-"}</strong>
            <small>mejor nota</small>
          </article>
          <article>
            <span>Tramos</span>
            <strong>{occupiedBands}</strong>
            <small>activos</small>
          </article>
        </div>
      </section>

      {hasEnoughForExtremes ? (
        <section className="profile-picks-panel" aria-label="Películas destacadas del perfil">
          <ProfilePickColumn
            eyebrow={isSelf ? "Tu top 3" : "Top 3"}
            title="Mejor valoradas"
            items={profile.topThree}
            emptyText={isSelf ? "Todavía no has valorado películas." : "Todavía no ha valorado películas."}
          />
          <ProfilePickColumn
            eyebrow={isSelf ? "Tu bottom 3" : "Bottom 3"}
            title="Peor valoradas"
            items={profile.bottomThree}
            emptyText={isSelf ? "Todavía no has valorado películas." : "Todavía no ha valorado películas."}
            muted
          />
        </section>
      ) : (
        <section className="profile-early-panel" aria-label="Primeras valoraciones del perfil">
          <div className="profile-section-heading">
            <div>
              <p className="eyebrow">{profile.ratingsCount > 0 ? "Primeras valoraciones" : "Perfil por estrenar"}</p>
              <h2>{profile.ratingsCount > 0 ? "El criterio aún está tomando forma" : "Aún no hay notas"}</h2>
            </div>
            <p>
              {profile.ratingsCount > 0
                ? `${formatCount(profile.ratingsCount, "nota")} todavía es pronto para separar mejores y peores películas.`
                : isSelf
                  ? "Cuando valores tu primera película, este espacio empezará a dibujar tu perfil."
                  : `${profile.user.name} todavía no ha dejado ninguna valoración.`}
            </p>
          </div>

          {earlyRatings.length > 0 ? (
            <ProfilePosterGrid items={earlyRatings} />
          ) : isSelf ? (
            <div className="profile-early-empty">
              <p>Tu primera nota está a una película de distancia.</p>
              <Link href="/explorar" className="primary-button">
                Explorar películas
              </Link>
            </div>
          ) : null}
        </section>
      )}

      <section className="profile-distribution-panel" aria-label="Distribución de notas">
        <div className="profile-section-heading">
          <div>
            <p className="eyebrow">Distribución de notas</p>
            <h2>Cómo puntúas</h2>
          </div>
          <p>
            {isSelf
              ? "Intervalos de 0,5 puntos para ver donde se concentra tu criterio."
              : "Intervalos de 0,5 puntos para ver donde se concentra su criterio."}
          </p>
        </div>

        <div className="rating-distribution-shell profile-distribution-shell">
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
              <span />
            </div>

            <div className="rating-distribution-columns">
              {profile.distribution.map((item) => (
                <div
                  key={item.label}
                  className="rating-distribution-column"
                  title={`${item.label}: ${formatCount(item.count, "nota")}`}
                >
                  <div className="rating-distribution-count">{item.count > 0 ? item.count : ""}</div>
                  <div className="rating-distribution-track">
                    <div
                      className={`rating-distribution-bar ${item.count > 0 ? "rating-distribution-bar-active" : ""}`}
                      style={{ height: `${Math.max(item.ratio * 100, item.count > 0 ? 7 : 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rating-distribution-axis-shell">
            <div className="rating-distribution-axis">
              {profile.distribution.map((item) => (
                <span key={item.label}>{item.axisLabel}</span>
              ))}
            </div>

            {profile.ratingsCount > 0 ? (
              <div className="rating-distribution-average-chip" style={{ left: `${averageMarker}%` }}>
                <span className="rating-distribution-average-dot" aria-hidden="true" />
                <strong>Media {formatScore(profile.averageScore)}</strong>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfilePickColumn({
  eyebrow,
  title,
  items,
  emptyText,
  muted = false
}: {
  eyebrow: string;
  title: string;
  items: Array<UserRating & { movie: Movie }>;
  emptyText: string;
  muted?: boolean;
}) {
  return (
    <div className="profile-pick-column">
      <div className="profile-section-heading profile-pick-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>

      {items.length > 0 ? (
        <ProfilePosterGrid items={items} muted={muted} />
      ) : (
        <div className="profile-empty-state">
          <p>{emptyText}</p>
        </div>
      )}
    </div>
  );
}

function ProfilePosterGrid({
  items,
  muted = false
}: {
  items: Array<UserRating & { movie: Movie }>;
  muted?: boolean;
}) {
  return (
    <div className="profile-poster-grid">
      {items.map((item, index) => (
        <Link key={item.id} href={`/peliculas/${item.movie.slug}`} className="history-card-link">
          <article className="top-poster-card profile-poster-card">
            <MoviePoster movie={item.movie} compact showDetails={false} showDuration={false} />
            <div className="top-poster-rank">#{index + 1}</div>
            <div className={`top-poster-score ${muted ? "top-poster-score-muted" : ""}`}>{formatScore(item.score)}</div>
          </article>
        </Link>
      ))}
    </div>
  );
}
