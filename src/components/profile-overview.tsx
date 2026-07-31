import { CSSProperties } from "react";
import Link from "next/link";

import { DirectionalChapterAssist } from "@/components/directional-chapter-assist";
import { PosterImage } from "@/components/poster-image";
import { UserAvatar } from "@/components/user-avatar";
import { Movie, User, UserRating } from "@/lib/types";
import { formatCount, formatScore } from "@/lib/utils";

type RatedMovie = UserRating & { movie: Movie };

type HydratedProfile = {
  user: User;
  ratingsCount: number;
  averageScore: number;
  topThree: RatedMovie[];
  bottomThree: RatedMovie[];
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
  const title = isSelf ? "Tu perfil" : profile.user.name;
  const heroMovie = profile.topThree[0]?.movie;
  const heroArtwork = heroMovie?.backdrop || heroMovie?.posterUrl;
  const heroStyle = heroArtwork
    ? ({ "--profile-hero-image": `url("${heroArtwork}")` } as CSSProperties)
    : undefined;

  return (
    <div className="profile-overview profile-editorial">
      <DirectionalChapterAssist />

      <section
        id="perfil-portada"
        className="profile-command-panel"
        data-scroll-chapter
        aria-labelledby="profile-title"
        style={heroStyle}
      >
        <div className="profile-command-identity">
          <div className="profile-command-portrait">
            <UserAvatar user={profile.user} size="lg" />
          </div>
          <div className="profile-command-copy">
            <p className="cinema-kicker">{isSelf ? "Mi perfil" : "Perfil"}</p>
            <h1 id="profile-title">{title}</h1>
            <p className="profile-command-handle">@{profile.user.username}</p>
          </div>
        </div>

        <div className="profile-command-ledger" aria-label="Resumen de puntuaciones">
          <article className="profile-ledger-primary">
            <span>Media</span>
            <strong>{profile.ratingsCount > 0 ? formatScore(profile.averageScore) : "-"}</strong>
          </article>
          <article>
            <span>Películas</span>
            <strong>{profile.ratingsCount}</strong>
          </article>
          <article>
            <span>Nota más alta</span>
            <strong>{profile.ratingsCount > 0 ? formatScore(profile.bestScore) : "-"}</strong>
          </article>
        </div>
        <ChapterNav down="#valoraciones-destacadas" downLabel="Bajar a valoraciones destacadas" />
      </section>

      {hasEnoughForExtremes ? (
        <section id="valoraciones-destacadas" className="profile-selections-panel" data-scroll-chapter aria-label="Valoraciones destacadas del perfil">
          <div className="profile-chapter-heading">
            <p className="cinema-kicker">Selección</p>
            <h2>{isSelf ? "Tus valoraciones" : `Las valoraciones de ${profile.user.name}`}</h2>
          </div>
          <ProfileSelections top={profile.topThree} bottom={profile.bottomThree} />
          <ChapterNav
            up="#perfil-portada"
            upLabel="Subir al perfil"
            down={isSelf ? "#ajustes-perfil" : undefined}
            downLabel="Bajar a ajustes del perfil"
          />
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
          </div>
          {earlyRatings.length > 0 ? (
            <ProfileEarlySelection items={earlyRatings} />
          ) : isSelf ? (
            <div className="profile-early-empty">
              <Link href="/explorar" className="primary-button">Explorar películas</Link>
            </div>
          ) : null}
          <ChapterNav
            up="#perfil-portada"
            upLabel="Subir al perfil"
            down={isSelf ? "#ajustes-perfil" : undefined}
            downLabel="Bajar a ajustes del perfil"
          />
        </section>
      )}
    </div>
  );
}

function ProfileSelections({ top, bottom }: { top: RatedMovie[]; bottom: RatedMovie[] }) {
  const items = [
    ...top.map((item, index) => ({ item, group: "Entre las favoritas", rank: index + 1 })),
    ...bottom.map((item, index) => ({ item, group: "En la parte baja", rank: index + 1 }))
  ];

  return (
    <div className="profile-ensemble" data-count={items.length}>
      {items.map(({ item, group, rank }, index) => (
        <Link
          key={`${group}-${item.id}`}
          href={`/peliculas/${item.movie.slug}`}
          className="profile-ensemble-item"
          data-group={index < 3 ? "high" : "low"}
          style={{ "--ensemble-index": index } as CSSProperties}
        >
          <PosterImage src={item.movie.backdrop || item.movie.posterUrl} loading={index < 3 ? "eager" : "lazy"} />
          <div className="profile-ensemble-shade" />
          <div className="profile-ensemble-topline">
            <span>{group}</span>
            <b>{String(rank).padStart(2, "0")}</b>
          </div>
          <div className="profile-ensemble-copy">
            <h3>{item.movie.title}</h3>
            <div><strong>{formatScore(item.score)}</strong><small>{item.movie.year}</small></div>
          </div>
        </Link>
      ))}
      </div>
  );
}

function ProfileEarlySelection({ items }: { items: RatedMovie[] }) {
  const [featured, ...rest] = items;
  return (
    <div className="profile-early-selection">
      <Link href={`/peliculas/${featured.movie.slug}`} className="profile-selection-featured">
        <PosterImage src={featured.movie.backdrop || featured.movie.posterUrl} loading="eager" />
        <div className="profile-selection-featured-shade" />
        <div className="profile-selection-featured-copy">
          <span>Primera selección</span>
          <h3>{featured.movie.title}</h3>
          <div><strong>{formatScore(featured.score)}</strong><small>{featured.movie.year}</small></div>
        </div>
      </Link>
      {rest.length > 0 ? (
        <div className="profile-selection-ledger profile-early-ledger">
          {rest.map((item, index) => <SelectionRow key={item.id} item={item} index={index + 2} />)}
        </div>
      ) : null}
    </div>
  );
}

function SelectionRow({ item, index }: { item: RatedMovie; index: number }) {
  return (
    <Link href={`/peliculas/${item.movie.slug}`} className="profile-selection-row">
      <span>{String(index).padStart(2, "0")}</span>
      <div><strong>{item.movie.title}</strong><small>{item.movie.year}</small></div>
      <b>{formatScore(item.score)}</b>
    </Link>
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
