import { GroupMemberCard } from "@/components/group-member-card";
import { getGroupPageData, getSessionUser } from "@/lib/store";
import { slugify } from "@/lib/utils";

export default async function GroupPage() {
  const [groupData, sessionUser] = await Promise.all([getGroupPageData(), getSessionUser()]);
  const adminCount = groupData.members.filter(({ member }) => member.isAdmin).length;

  return (
    <div className="group-page-stack">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">Nuestro grupo</p>
          <h1>{groupData.group.name}</h1>
        </div>

        <div className="group-intro-row">
          <p className="body-copy group-intro-copy">
            Aquí tenéis al grupo entero reunido en una sola vista, con acceso rápido a cada perfil y una lectura clara
            de cómo puntúa cada uno.
          </p>
          <div className="group-overview-pills">
            <span>{groupData.members.length} miembros</span>
            <span>
              {adminCount} admin{adminCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="group-member-grid">
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
      </section>
    </div>
  );
}
