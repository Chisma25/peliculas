"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/vistas", label: "Vistas" },
  { href: "/pendientes", label: "Pendientes" },
  { href: "/explorar", label: "Explorar" },
  { href: "/grupo", label: "Grupo" },
  { href: "/perfil", label: "Perfil" }
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PrimaryNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <nav className="nav-links" aria-label="Principal">
      {NAV_ITEMS.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        const isPending = pendingHref === item.href && !isActive;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link-pill ${isActive ? "nav-link-pill-active" : ""} ${isPending ? "nav-link-pill-pending" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (!isActive) {
                setPendingHref(item.href);
              }
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
