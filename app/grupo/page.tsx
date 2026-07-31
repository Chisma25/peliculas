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
  const mostActiveMember = [...groupData.members].sort(
    (left, right) => right.profileSummary.ratingsCount - left.profileSummary.ratingsCount
  )[0];
  const averageEligibleMembers = ratedMembers.filter((item) => item.profileSummary.ratingsCount > 10);
  const membersByAverage = [...averageEligibleMembers].sort(
    (left, right) => right.profileSummary.averageScore - left.profileSummary.averageScore
  );
  const highestAverageMember = membersByAverage[0];
  const lowestAverageMember = membersByAverage[membersByAverage.length - 1];
  const memberGridClassName = "group-member-grid";

  return (
    <section className="group-page-stack group-redesign group-editorial" aria-labelledby="group-title">
      <header className="group-editorial-hero">
        <div className="group-editorial-heading">
          <div className="group-editorial-title-block">
            <p className="cinema-kicker">El grupo</p>
            <h1 id="group-title">{groupData.group.name}</h1>
          </div>
          <p className="group-editorial-intro">
            {formatCount(groupData.members.length, "persona")} y {formatCount(totalRatings, "valoración")} compartidas.
          </p>
        </div>

        <div className="group-cast" aria-label="Miembros del grupo">
          {groupData.members.map(({ member, profileSummary }, index) => (
            <PrefetchLink
              href={`/grupo/${slugify(member.username)}`}
              className="group-cast-member"
              data-current={member.id === sessionUser?.id ? "true" : undefined}
              key={member.id}
              style={{ "--cast-index": index } as React.CSSProperties}
            >
              <UserAvatar user={member} size="lg" />
              <span className="group-cast-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="group-cast-copy">
                <strong>{member.name}</strong>
                <small>
                  {profileSummary.ratingsCount ? `${formatScore(profileSummary.averageScore)} de media` : "Sin notas"}
                </small>
              </span>
            </PrefetchLink>
          ))}
        </div>

        <div className="group-editorial-ledger" aria-label="Resumen del grupo">
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
      </header>

      <section className="group-roster-section" aria-labelledby="group-roster-title">
        <div className="group-roster-heading">
          <div>
            <p className="cinema-kicker">Perfiles</p>
            <h2 id="group-roster-title">El reparto</h2>
          </div>
          <span>{formatCount(groupData.members.length, "perfil")}</span>
        </div>

        <div className="group-roster-layout">
          <aside className="group-side-panel" aria-label="Resumen de actividad">
            <p className="group-side-label">De un vistazo</p>

            <div className="group-side-list">
              <article>
                <span>Más notas</span>
                <strong>{mostActiveMember?.member.name ?? "Sin datos"}</strong>
                <small>
                  {mostActiveMember?.profileSummary.ratingsCount
                    ? formatCount(mostActiveMember.profileSummary.ratingsCount, "valoración")
                    : "Todavía no hay notas"}
                </small>
              </article>
              <article>
                <span>Media más alta</span>
                <strong>{highestAverageMember?.member.name ?? "Sin datos"}</strong>
                <small>
                  {highestAverageMember ? formatScore(highestAverageMember.profileSummary.averageScore) : "Mínimo 10 notas"}
                </small>
              </article>
              <article>
                <span>Media más baja</span>
                <strong>{lowestAverageMember?.member.name ?? "Sin datos"}</strong>
                <small>
                  {lowestAverageMember ? formatScore(lowestAverageMember.profileSummary.averageScore) : "Mínimo 10 notas"}
                </small>
              </article>
            </div>
            <p className="group-side-note">Las medias comparadas solo incluyen perfiles con más de 10 notas.</p>
          </aside>

          <div className="group-roster-panel">
            <div className={memberGridClassName}>
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
        </div>
      </section>
    </section>
  );
}
