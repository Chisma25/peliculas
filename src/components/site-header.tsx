import Link from "next/link";

import { User } from "@/lib/types";

type SiteHeaderProps = {
  user: User | null;
};

export function SiteHeader({ user }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link href="/" className="brand-lockup">
        <span className="brand-mark">C</span>
        <div>
          <p>Cine semanal</p>
          <span>Club privado de pelis y recomendaciones</span>
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
        <span>{user?.name?.slice(0, 1) ?? "?"}</span>
        <div>
          <strong>{user?.name ?? "Invitado"}</strong>
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
