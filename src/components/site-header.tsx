import { PrefetchLink } from "@/components/prefetch-link";
import { PrimaryNav } from "@/components/primary-nav";
import { UserAvatar } from "@/components/user-avatar";
import { User } from "@/lib/types";

type SiteHeaderProps = {
  user: User | null;
};

export function SiteHeader({ user }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <PrefetchLink href="/" className="brand-lockup" aria-label="Ir al dashboard de Cine Semanal">
        <span className="brand-mark" aria-hidden="true">
          <img src="/brand/cine-semanal-mark.svg" alt="" className="brand-mark-image" />
        </span>
        <div className="brand-copy">
          <p>Cine Semanal</p>
          <span>Vuestras pelis, notas y planes de cada semana</span>
        </div>
      </PrefetchLink>

      <PrimaryNav />

      <div className="user-chip">
        <UserAvatar
          user={{ name: user?.name ?? "Invitado", avatarUrl: user?.avatarUrl }}
          size="sm"
          className="user-chip-avatar"
        />
        <div>
          <strong>{user?.name ?? "Invitado"}</strong>
          {user?.isAdmin ? <p className="user-chip-role">Administrador</p> : null}
          <div className="user-chip-actions">
            <PrefetchLink href="/perfil">Ver perfil</PrefetchLink>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="text-button">
                Salir
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
