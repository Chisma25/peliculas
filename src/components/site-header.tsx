import { PrefetchLink } from "@/components/prefetch-link";
import { PrimaryNav } from "@/components/primary-nav";
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
          <linearGradient id="brandGlow" x1="14%" y1="14%" x2="88%" y2="92%">
            <stop offset="0%" stopColor="#ffe0b4" />
            <stop offset="38%" stopColor="#f4b15f" />
            <stop offset="72%" stopColor="#d86f33" />
            <stop offset="100%" stopColor="#8d3718" />
          </linearGradient>
          <linearGradient id="brandFrame" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2b1320" />
            <stop offset="55%" stopColor="#151828" />
            <stop offset="100%" stopColor="#0c1220" />
          </linearGradient>
          <radialGradient id="brandAura" cx="50%" cy="18%" r="85%">
            <stop offset="0%" stopColor="rgba(255,224,180,0.34)" />
            <stop offset="45%" stopColor="rgba(214,101,53,0.18)" />
            <stop offset="100%" stopColor="rgba(12,18,32,0)" />
          </radialGradient>
        </defs>
        <rect x="4" y="4" width="64" height="64" rx="20" fill="url(#brandFrame)" />
        <rect x="8" y="8" width="56" height="56" rx="17" fill="url(#brandAura)" />
        <path
          d="M22 22.5c0-6.3 5.1-11.5 11.5-11.5h5c6.4 0 11.5 5.2 11.5 11.5V45c0 8.3-6.7 15-15 15s-15-6.7-15-15V22.5Z"
          fill="none"
          stroke="url(#brandGlow)"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        <path
          d="M28 27.5h16c2.5 0 4.5 2 4.5 4.5v11.5H23.5V32c0-2.5 2-4.5 4.5-4.5Z"
          fill="rgba(255,255,255,0.02)"
          stroke="url(#brandGlow)"
          strokeWidth="2.3"
        />
        <path
          d="M29 24.2h14"
          stroke="url(#brandGlow)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="m33.7 33.2 7.8 4.3-7.8 4.2Z"
          fill="url(#brandGlow)"
        />
        <circle cx="28" cy="18.7" r="2.2" fill="none" stroke="url(#brandGlow)" strokeWidth="2" />
        <circle cx="35.8" cy="16.5" r="2.9" fill="none" stroke="url(#brandGlow)" strokeWidth="2" />
        <circle cx="43.8" cy="18.7" r="2.2" fill="none" stroke="url(#brandGlow)" strokeWidth="2" />
        <path
          d="M26 49.5h20"
          stroke="url(#brandGlow)"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M29 54.2c2.1 1.6 4.4 2.3 7 2.3s4.9-.7 7-2.3"
          stroke="url(#brandGlow)"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M18.5 27v14.5M53.5 27v14.5"
          stroke="url(#brandGlow)"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx="18.5" cy="23" r="1.4" fill="url(#brandGlow)" />
        <circle cx="18.5" cy="45.5" r="1.4" fill="url(#brandGlow)" />
        <circle cx="53.5" cy="23" r="1.4" fill="url(#brandGlow)" />
        <circle cx="53.5" cy="45.5" r="1.4" fill="url(#brandGlow)" />
      </svg>
    </span>
  );
}

export function SiteHeader({ user }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <PrefetchLink href="/" className="brand-lockup" aria-label="Ir al dashboard de Cine Semanal">
        <CineSemanalMark />
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
