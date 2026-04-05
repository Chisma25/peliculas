import { GroupMemberAccessButton } from "@/components/group-member-access-button";
import { PrefetchLink } from "@/components/prefetch-link";
import { UserAvatar } from "@/components/user-avatar";
import { formatScore } from "@/lib/utils";

type GroupMemberCardProps = {
  member: {
    id: string;
    name: string;
    username: string;
    avatarUrl?: string;
    isAdmin?: boolean;
  };
  profileSummary: {
    ratingsCount: number;
    averageScore: number;
    bestScore: number;
  };
  profileHref: string;
  canManage: boolean;
};

export function GroupMemberCard({ member, profileSummary, profileHref, canManage }: GroupMemberCardProps) {
  return (
    <article className="member-card member-card-interactive">
      <div className="member-card-topline">
        <div className="member-card-head">
          <UserAvatar user={member} size="md" />
          <div className="member-card-heading">
            <strong>{member.name}</strong>
            <span>@{member.username}</span>
          </div>
        </div>
        {member.isAdmin ? <span className="status-pill status-pill-accent">Administrador</span> : null}
      </div>

      <div className="member-card-metrics">
        <div className="member-metric-chip">
          <small>Notas</small>
          <strong>{profileSummary.ratingsCount}</strong>
        </div>
        <div className="member-metric-chip">
          <small>Media</small>
          <strong>{profileSummary.ratingsCount ? formatScore(profileSummary.averageScore) : "-"}</strong>
        </div>
        <div className="member-metric-chip">
          <small>Techo</small>
          <strong>{profileSummary.ratingsCount ? formatScore(profileSummary.bestScore) : "-"}</strong>
        </div>
      </div>

      <div className="member-card-actions">
        <PrefetchLink href={profileHref} className="secondary-button">
          Ver perfil
        </PrefetchLink>
        {canManage ? <GroupMemberAccessButton member={member} /> : null}
      </div>
    </article>
  );
}
