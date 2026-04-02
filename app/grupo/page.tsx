import { GroupMemberCard } from "@/components/group-member-card";
import { getGroupPageData, getSessionUser } from "@/lib/store";
import { formatScore, slugify } from "@/lib/utils";

export default async function GroupPage() {
  const [groupData, sessionUser] = await Promise.all([getGroupPageData(), getSessionUser()]);

  return (
    <div className="group-grid">
      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">Nuestro grupo</p>
          <h1>{groupData.group.name}</h1>
          <p className="body-copy">
            Aquí veis a toda la peña del grupo, cómo puntúa cada uno y el pulso cinéfilo que va cogiendo la app con
            vuestras notas y elecciones de cada semana.
          </p>
        </div>

        <div className="member-list">
          {groupData.members.map(({ member, profileSummary }) => {
            const summaryText = profileSummary.ratingsCount
              ? `${profileSummary.ratingsCount} notas · media ${formatScore(profileSummary.averageScore)} · mejor nota ${formatScore(profileSummary.bestScore)}`
              : "Todavía no tiene valoraciones suficientes para sacar perfil.";

            return (
              <GroupMemberCard
                key={member.id}
                member={member}
                profileSummary={summaryText}
                profileHref={`/grupo/${slugify(member.username)}`}
                canManage={Boolean(sessionUser?.isAdmin)}
              />
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
            <p className="body-copy">
              El motor cruza vuestras notas con géneros, director, reparto, década, idioma, país y señales semánticas
              sacadas de la sinopsis y los metadatos.
            </p>
          </article>

          <article className="member-card">
            <strong>Contexto semanal</strong>
            <p className="body-copy">
              No solo mira lo que os gusta en general: también tiene en cuenta lo último que habéis visto para no
              repetiros demasiado y ajustar mejor qué apetece esta semana.
            </p>
          </article>

          <article className="member-card">
            <strong>Encaje y pulso</strong>
            <p className="body-copy">
              Cada recomendación mezcla radar de grupo, consenso, encaje semanal y novedad o momento dentro de
              pendientes. La media del grupo ahora mismo es {formatScore(groupData.stats.averageScore)}.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
