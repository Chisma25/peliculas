import Link from "next/link";

import { DirectionalChapterAssist } from "@/components/directional-chapter-assist";
import { MoviePoster } from "@/components/movie-poster";
import { UserAvatar } from "@/components/user-avatar";
import { Movie, User, UserRating } from "@/lib/types";
import { formatCount, formatScore } from "@/lib/utils";

type HydratedProfile = {
  user: User;
  ratingsCount: number;
  averageScore: number;
  topThree: Array<UserRating & { movie: Movie }>;
  bottomThree: Array<UserRating & { movie: Movie }>;
  bestScore: number;
  distribution: Array<{ value: number; label: string; count: number; ratio: number; axisLabel: string }>;
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
    .slice(0, 5);
  const averageMarker = Math.max(0, Math.min(100, (profile.averageScore / 10) * 100));
  const dominantBand = [...profile.distribution].sort((left, right) => right.count - left.count || right.value - left.value)[0];
  const occupiedBands = profile.distribution.filter((item) => item.count > 0).length;
  const title = isSelf ? "Tu perfil" : profile.user.name;

  return (
    <div className="profile-overview profile-editorial">
      <DirectionalChapterAssist />

      <section id="perfil-portada" className="profile-command-panel" data-scroll-chapter aria-labelledby="profile-title">
        <div className="profile-command-portrait">
          <UserAvatar user={profile.user} size="lg" />
          <span aria-hidden="true">{String(profile.ratingsCount).padStart(2, "0")}</span>
        </div>
        <div className="profile-command-copy">
          <p className="cinema-kicker">{isSelf ? "Mi perfil" : "Perfil"}</p>
          <h1 id="profile-title">{title}</h1>
          <p className="profile-command-handle">@{profile.user.username}</p>
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
        <ChapterNav down="#valoraciones-destacadas" downLabel="Bajar a valoraciones destacadas" />
      </section>

      {hasEnoughForExtremes ? (
        <section id="valoraciones-destacadas" className="profile-picks-panel" data-scroll-chapter aria-label="Películas destacadas del perfil">
          <div className="profile-chapter-heading">
            <p className="cinema-kicker">Valoraciones</p>
            <h2>Mejores y peores</h2>
          </div>
          <ProfilePickColumn eyebrow="Top 3" title="Mejor valoradas" items={profile.topThree} emptyText="Sin valoraciones." />
          <ProfilePickColumn eyebrow="Bottom 3" title="Peor valoradas" items={profile.bottomThree} emptyText="Sin valoraciones." muted />
          <ChapterNav up="#perfil-portada" upLabel="Subir al perfil" down="#distribucion-notas" downLabel="Bajar a distribución de notas" />
        </section>
      ) : (
        <section id="valoraciones-destacadas" className="profile-early-panel" data-scroll-chapter aria-label="Primeras valoraciones del perfil">
          <div className="profile-section-heading">
            <div>
              <p className="cinema-kicker">Valoraciones</p>
              <h2>
                {profile.ratingsCount > 0
                  ? `${formatCount(profile.ratingsCount, "película")} ${profile.ratingsCount === 1 ? "valorada" : "valoradas"}`
                  : "Sin valoraciones"}
              </h2>
            </div>
            <p>
              {profile.ratingsCount > 0
                ? "Las primeras notas del perfil."
                : isSelf
                  ? "Todavía no has puntuado ninguna película."
                  : `${profile.user.name} todavía no ha puntuado ninguna película.`}
            </p>
          </div>
          {earlyRatings.length > 0 ? (
            <ProfilePosterGrid items={earlyRatings} />
          ) : isSelf ? (
            <div className="profile-early-empty">
              <Link href="/explorar" className="primary-button">Explorar películas</Link>
            </div>
          ) : null}
          <ChapterNav up="#perfil-portada" upLabel="Subir al perfil" down="#distribucion-notas" downLabel="Bajar a distribución de notas" />
        </section>
      )}

      <section id="distribucion-notas" className="profile-distribution-panel" data-scroll-chapter aria-label="Distribución de notas">
        <div className="profile-section-heading">
          <div>
            <p className="cinema-kicker">Distribución</p>
            <h2>{isSelf ? "Tus notas" : `Notas de ${profile.user.name}`}</h2>
          </div>
        </div>

        <div className="rating-distribution-shell profile-distribution-shell">
          <div className="rating-distribution-summary">
            <article className="rating-distribution-stat"><small>Media</small><strong>{profile.ratingsCount > 0 ? formatScore(profile.averageScore) : "-"}</strong></article>
            <article className="rating-distribution-stat"><small>Tramo dominante</small><strong>{dominantBand?.count ? formatScore(dominantBand.value) : "-"}</strong></article>
            <article className="rating-distribution-stat"><small>Tramos activos</small><strong>{occupiedBands}</strong></article>
          </div>
          <div className="rating-distribution-frame">
            <div className="rating-distribution-grid" aria-hidden="true"><span /><span /><span /><span /></div>
            <div className="rating-distribution-columns">
              {profile.distribution.map((item) => (
                <div key={item.label} className="rating-distribution-column" title={`${formatScore(item.value)}: ${formatCount(item.count, "nota")}`}>
                  <div className="rating-distribution-count">{item.count > 0 ? item.count : ""}</div>
                  <div className="rating-distribution-track">
                    <div className={`rating-distribution-bar ${item.count > 0 ? "rating-distribution-bar-active" : ""}`} style={{ height: `${Math.max(item.ratio * 100, item.count > 0 ? 7 : 2)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rating-distribution-axis-shell">
            <div className="rating-distribution-axis">
              {profile.distribution.map((item) => <span key={item.label}>{item.axisLabel ? formatScore(item.value) : ""}</span>)}
            </div>
            {profile.ratingsCount > 0 ? (
              <div className="rating-distribution-average-chip" style={{ left: `${averageMarker}%` }}>
                <span className="rating-distribution-average-dot" aria-hidden="true" />
                <strong>Media {formatScore(profile.averageScore)}</strong>
              </div>
            ) : null}
          </div>
        </div>
        <ChapterNav up="#valoraciones-destacadas" upLabel="Subir a valoraciones destacadas" down={isSelf ? "#ajustes-perfil" : undefined} downLabel="Bajar a ajustes del perfil" />
      </section>
    </div>
  );
}

function ChapterNav({ up, upLabel, down, downLabel }: { up?: string; upLabel?: string; down?: string; downLabel?: string }) {
  return (
    <nav className="cinema-chapter-nav" aria-label="Navegación entre secciones">
      {up ? <a href={up} aria-label={upLabel}>↑</a> : null}
      {down ? <a href={down} aria-label={downLabel}>↓</a> : null}
    </nav>
  );
}

function ProfilePickColumn({ eyebrow, title, items, emptyText, muted = false }: { eyebrow: string; title: string; items: Array<UserRating & { movie: Movie }>; emptyText: string; muted?: boolean }) {
  return (
    <div className="profile-pick-column">
      <div className="profile-section-heading profile-pick-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></div>
      {items.length > 0 ? <ProfilePosterGrid items={items} muted={muted} /> : <div className="profile-empty-state"><p>{emptyText}</p></div>}
    </div>
  );
}

function ProfilePosterGrid({ items, muted = false }: { items: Array<UserRating & { movie: Movie }>; muted?: boolean }) {
  return (
    <div className="profile-poster-grid" data-count={items.length}>
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
