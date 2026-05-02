"use client";

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
        </div>
      </PrefetchLink>

      <PrimaryNav />

      <details className="user-chip user-menu">
        <summary className="user-menu-summary" aria-label="Abrir menú de usuario">
          <UserAvatar
            user={{ name: user?.name ?? "Invitado", avatarUrl: user?.avatarUrl }}
            size="sm"
            className="user-chip-avatar"
          />
          <span className="user-menu-status" aria-hidden="true" />
        </summary>
        <div className="user-chip-actions">
          <div className="user-menu-card-copy">
            <strong>{user?.name ?? "Invitado"}</strong>
            {user?.isAdmin ? <span className="user-chip-role">Administrador</span> : null}
          </div>
          <PrefetchLink href="/perfil">Perfil</PrefetchLink>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-button">
              Salir
            </button>
          </form>
        </div>
      </details>
    </header>
  );
}
