import Link from "next/link";

import { AdminAccountsPanel } from "@/components/admin-accounts-panel";
import { UserAvatar } from "@/components/user-avatar";
import { getDashboardData, getProfileDataHydrated, getSessionUser, listMembers } from "@/lib/store";
import { formatScore } from "@/lib/utils";

export default async function GroupPage() {
  const [members, dashboard, sessionUser] = await Promise.all([listMembers(), getDashboardData(), getSessionUser()]);
  const memberCards = await Promise.all(
    members.map(async (member) => ({
      member,
      profile: await getProfileDataHydrated(member.id)
    }))
  );

  return (
    <div className="group-grid">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">Nuestro grupo</p>
          <h1>{dashboard.group.name}</h1>
          <p className="body-copy">
            Desde aquí podéis entrar en el perfil de cada uno en modo lectura para ver cómo puntúa, su top personal y
            sus gustos dentro del grupo.
          </p>
        </div>
        <div className="member-list">
          {memberCards.map(({ member, profile }) => {
            return (
              <article key={member.id} className="member-card">
                <div className="member-card-head">
                  <UserAvatar user={member} size="md" />
                  <div className="member-card-heading">
                    <strong>{member.name}</strong>
                    <span>@{member.username}</span>
                  </div>
                </div>
                <p className="muted-copy">
                  {profile?.ratingsCount
                    ? `${profile.ratingsCount} notas · media ${formatScore(profile.averageScore)} · mejor nota ${formatScore(profile.bestScore)}`
                    : "Todavía no tiene valoraciones suficientes para sacar perfil."}
                </p>
                <Link href={`/grupo/${member.username}`} className="secondary-button">
                  Ver perfil
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">Resumen del grupo</p>
          <h2>Cómo decide la app</h2>
        </div>
        <div className="member-list">
          <article className="member-card">
            <strong>Historial compartido</strong>
            <p className="body-copy">Se excluyen películas ya vistas y se priorizan directores, décadas y géneros mejor puntuados.</p>
          </article>
          <article className="member-card">
            <strong>Equilibrio semanal</strong>
            <p className="body-copy">La tanda intenta no repetirse demasiado y mantener cinco opciones con algo de contraste.</p>
          </article>
          <article className="member-card">
            <strong>Encaje estimado</strong>
            <p className="body-copy">
              Cada recomendación muestra un encaje relativo dentro del pool actual. La media del grupo ahora mismo es{" "}
              {formatScore(dashboard.stats.averageScore)}.
            </p>
          </article>
        </div>
      </section>

      {sessionUser?.isAdmin ? <AdminAccountsPanel members={members} /> : null}
    </div>
  );
}
