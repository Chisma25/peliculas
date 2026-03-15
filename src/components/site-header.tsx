import Link from "next/link";

import { UserAvatar } from "@/components/user-avatar";
import { User } from "@/lib/types";

type SiteHeaderProps = {
  user: User | null;
};

function CineSemanalMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 72 72" className="brand-mark-svg" role="presentation">
        <defs>
          <linearGradient id="brandGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffd29c" />
            <stop offset="45%" stopColor="#f0a44f" />
            <stop offset="100%" stopColor="#b95a1f" />
          </linearGradient>
          <linearGradient id="brandDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3a1c1f" />
            <stop offset="100%" stopColor="#140e1b" />
          </linearGradient>
        </defs>
        <path
          d="M36 6 58 14v20c0 14-8.6 24.2-22 31.2C22.6 58.2 14 48 14 34V14L36 6Z"
          fill="url(#brandDark)"
          stroke="url(#brandGold)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M22 23.5h22.5a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5H22a2.5 2.5 0 0 1-2.5-2.5V26a2.5 2.5 0 0 1 2.5-2.5Z"
          fill="none"
          stroke="url(#brandGold)"
          strokeWidth="2.6"
        />
        <circle cx="27" cy="18" r="4.7" fill="none" stroke="url(#brandGold)" strokeWidth="2.4" />
        <circle cx="38" cy="18.5" r="5.7" fill="none" stroke="url(#brandGold)" strokeWidth="2.4" />
        <circle cx="27" cy="18" r="1.3" fill="url(#brandGold)" />
        <circle cx="38" cy="18.5" r="1.5" fill="url(#brandGold)" />
        <path d="m44.5 29 8.5 4.3-8.5 4.2Z" fill="url(#brandGold)" />
        <path d="M17.5 29.5 12 33l5.5 3.5Z" fill="url(#brandGold)" />
        <path d="M22 45h28" stroke="url(#brandGold)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M24 51c3 2.2 7 3.5 12 3.5S45 53.2 48 51" stroke="url(#brandGold)" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function SiteHeader({ user }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link href="/" className="brand-lockup">
        <CineSemanalMark />
        <div className="brand-copy">
          <span className="brand-kicker">Privado</span>
          <p>Cine Semanal</p>
          <span>Vuestras pelis, notas y planes de cada semana</span>
        </div>
      </Link>

      <nav className="nav-links" aria-label="Principal">
        <Link href="/">Dashboard</Link>
        <Link href="/vistas">Vistas</Link>
        <Link href="/pendientes">Pendientes</Link>
        <Link href="/explorar">Explorar</Link>
        <Link href="/grupo">Grupo</Link>
        <Link href="/perfil">Perfil</Link>
      </nav>

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
            <Link href="/perfil">Editar perfil</Link>
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
