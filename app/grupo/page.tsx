import { GroupMemberCard } from "@/components/group-member-card";
import { getGroupPageData, getSessionUser } from "@/lib/store";
import { formatScore, slugify } from "@/lib/utils";

export default async function GroupPage() {
  const [groupData, sessionUser] = await Promise.all([getGroupPageData(), getSessionUser()]);
  const adminCount = groupData.members.filter(({ member }) => member.isAdmin).length;
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
  const memberGridClassName =
    groupData.members.length === 6 ? "group-member-grid group-member-grid--balanced" : "group-member-grid";

  return (
    <section className="group-page-stack group-redesign" aria-labelledby="group-title">
      <div className="group-roster-layout">
        <aside className="group-side-panel" aria-label="Lectura rapida del grupo">
          <div>
            <p className="eyebrow">Lectura rapida</p>
            <h1 id="group-title">{groupData.group.name}</h1>
          </div>

          <div className="group-side-list">
            <article>
              <span>Mas activo</span>
              <strong>{mostActiveMember?.member.name ?? "Sin datos"}</strong>
              <small>
                {mostActiveMember?.profileSummary.ratingsCount
                  ? `${mostActiveMember.profileSummary.ratingsCount} notas`
                  : "Todavia no hay notas"}
              </small>
            </article>
            <article>
              <span>Mayor media +10</span>
              <strong>{highestAverageMember?.member.name ?? "Sin datos"}</strong>
              <small>
                {highestAverageMember
                  ? `${formatScore(highestAverageMember.profileSummary.averageScore)} con ${highestAverageMember.profileSummary.ratingsCount} notas`
                  : "Nadie supera las 10 notas todavia"}
              </small>
            </article>
            <article>
              <span>Menor media +10</span>
              <strong>{lowestAverageMember?.member.name ?? "Sin datos"}</strong>
              <small>
                {lowestAverageMember
                  ? `${formatScore(lowestAverageMember.profileSummary.averageScore)} con ${lowestAverageMember.profileSummary.ratingsCount} notas`
                  : "Nadie supera las 10 notas todavia"}
              </small>
            </article>
            <article>
              <span>Grupo</span>
              <strong>{totalRatings ? formatScore(groupAverage) : "-"}</strong>
              <small>
                {groupData.members.length} miembros - {totalRatings} notas - {adminCount} admin{adminCount === 1 ? "" : "s"}
              </small>
            </article>
          </div>
        </aside>

        <div className="group-roster-panel">
          <div className="group-roster-header">
            <div>
              <p className="eyebrow">Perfiles</p>
            </div>
            <span>{groupData.members.length} fichas</span>
          </div>

          <div className={memberGridClassName}>
            {groupData.members.map(({ member, profileSummary }) => (
              <GroupMemberCard
                key={member.id}
                member={member}
                profileSummary={profileSummary}
                profileHref={`/grupo/${slugify(member.username)}`}
                canManage={Boolean(sessionUser?.isAdmin)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
