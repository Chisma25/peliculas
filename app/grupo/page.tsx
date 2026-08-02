import type { CSSProperties } from "react";

import { DirectionalChapterAssist } from "@/components/directional-chapter-assist";
import { GroupMemberCard } from "@/components/group-member-card";
import { PrefetchLink } from "@/components/prefetch-link";
import { UserAvatar } from "@/components/user-avatar";
import { getGroupPageData, getSessionUser } from "@/lib/store";
import { formatCount, formatScore, slugify } from "@/lib/utils";

export default async function GroupPage() {
  const [groupData, sessionUser] = await Promise.all([getGroupPageData(), getSessionUser()]);
  const totalRatings = groupData.members.reduce((sum, item) => sum + item.profileSummary.ratingsCount, 0);
  const ratedMembers = groupData.members.filter((item) => item.profileSummary.ratingsCount > 0);
  const groupAverage =
    totalRatings > 0
      ? ratedMembers.reduce((sum, item) => sum + item.profileSummary.averageScore * item.profileSummary.ratingsCount, 0) /
        totalRatings
      : 0;

  return (
    <section className="group-page-stack group-redesign group-editorial" aria-labelledby="group-title">
      <DirectionalChapterAssist />

      <header id="grupo-portada" className="group-editorial-hero" data-scroll-chapter>
        <div className="group-editorial-heading">
          <div className="group-editorial-title-block">
            <p className="cinema-kicker">El grupo</p>
            <h1 id="group-title">{groupData.group.name}</h1>
          </div>
          <p className="group-editorial-intro">{formatCount(groupData.members.length, "perfil", "perfiles")}</p>
        </div>

        <div className="group-cast" aria-label="Miembros del grupo">
          {groupData.members.map(({ member }, index) => (
            <PrefetchLink
              href={`/grupo/${slugify(member.username)}`}
              className="group-cast-member"
              data-current={member.id === sessionUser?.id ? "true" : undefined}
              key={member.id}
              style={{ "--cast-index": index } as CSSProperties}
            >
              <UserAvatar user={member} size="lg" />
              <span className="group-cast-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="group-cast-copy">
                <strong>{member.name}</strong>
                <small>Ver perfil</small>
              </span>
            </PrefetchLink>
          ))}
        </div>

        <nav className="cinema-chapter-nav" aria-label="Navegación entre secciones">
          <a href="#resumen-grupo" aria-label="Bajar al resumen del grupo" title="Ir al resumen">
            <span aria-hidden="true">↓</span>
          </a>
        </nav>
      </header>

      <section
        id="resumen-grupo"
        className="group-roster-section"
        data-scroll-chapter
        aria-labelledby="group-roster-title"
      >
        <div className="group-stats-header">
          <div className="group-stats-title">
            <p className="cinema-kicker">Estadísticas</p>
            <h2 id="group-roster-title">Resumen del grupo</h2>
          </div>

          <div className="group-editorial-ledger" aria-label="Totales del grupo">
            <article>
              <span>Miembros</span>
              <strong>{groupData.members.length}</strong>
            </article>
            <article>
              <span>Valoraciones</span>
              <strong>{totalRatings}</strong>
            </article>
            <article>
              <span>Media</span>
              <strong>{totalRatings ? formatScore(groupAverage) : "—"}</strong>
            </article>
          </div>
        </div>

        <div className="group-roster-panel">
          <div className="group-member-grid">
            {groupData.members.map(({ member, profileSummary }, index) => (
              <GroupMemberCard
                key={member.id}
                member={member}
                profileSummary={profileSummary}
                profileHref={`/grupo/${slugify(member.username)}`}
                canManage={Boolean(sessionUser?.isAdmin)}
                index={index}
              />
            ))}
          </div>
        </div>

        <nav className="cinema-chapter-nav" aria-label="Navegación entre secciones">
          <a href="#grupo-portada" aria-label="Subir a los perfiles" title="Volver a los perfiles">
            <span aria-hidden="true">↑</span>
          </a>
        </nav>
      </section>
    </section>
  );
}
