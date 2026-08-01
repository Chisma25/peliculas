"use client";

import { useEffect, useRef } from "react";

import { PrefetchLink } from "@/components/prefetch-link";
import { PrimaryNav } from "@/components/primary-nav";
import { UserAvatar } from "@/components/user-avatar";
import type { DeploymentVersion } from "@/lib/deployment-version";
import { User } from "@/lib/types";

type SiteHeaderProps = {
  user: User | null;
  deploymentVersion: DeploymentVersion;
};

export function SiteHeader({ user, deploymentVersion }: SiteHeaderProps) {
  const userMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const menu = userMenuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.removeAttribute("open");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        userMenuRef.current?.removeAttribute("open");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function closeUserMenu() {
    userMenuRef.current?.removeAttribute("open");
  }

  return (
    <header className={`site-header ${user ? "" : "site-header-public"}`}>
      <PrefetchLink href="/" className="brand-lockup" aria-label="Ir al dashboard de Cine Semanal">
        <span className="brand-mark" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/cine-semanal-mark.svg" alt="" className="brand-mark-image" width={50} height={50} />
        </span>
        <div className="brand-copy">
          <p>Cine Semanal</p>
        </div>
      </PrefetchLink>

      {user ? (
        <>
          <PrimaryNav />

          <details ref={userMenuRef} className="user-chip user-menu">
            <summary className="user-menu-summary" aria-label="Abrir menú de usuario">
              <UserAvatar user={{ name: user.name, avatarUrl: user.avatarUrl }} size="sm" className="user-chip-avatar" />
              <span className="user-menu-status" aria-hidden="true" />
            </summary>
            <div className="user-chip-actions">
              <div className="user-menu-card-copy">
                <span className="user-menu-eyebrow">Cuenta</span>
                <strong>{user.name}</strong>
                <span className="user-menu-handle">@{user.username}</span>
                {user.isAdmin ? <span className="user-chip-role">Administrador</span> : null}
              </div>
              <nav className="user-menu-links" aria-label="Opciones de cuenta">
                <PrefetchLink href="/perfil" onClick={closeUserMenu}>
                  <span>Mi perfil</span>
                  <span aria-hidden="true">↗</span>
                </PrefetchLink>
                <PrefetchLink href="/perfil#ajustes-perfil" onClick={closeUserMenu}>
                  <span>Editar perfil</span>
                  <span aria-hidden="true">→</span>
                </PrefetchLink>
              </nav>
              <div className="user-menu-footer">
                <span
                  className="deployment-version"
                  title={`${deploymentVersion.commitRef}@${deploymentVersion.commitSha}`}
                >
                  {deploymentVersion.environment} · {deploymentVersion.shortCommitSha}
                </span>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="text-button">
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </details>
        </>
      ) : null}
    </header>
  );
}
