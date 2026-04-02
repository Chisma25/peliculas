"use client";

import { useEffect, useState, useTransition } from "react";

import { usePathname, useRouter } from "next/navigation";

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
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    for (const item of NAV_ITEMS) {
      router.prefetch(item.href);
    }
  }, [router]);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <nav className="nav-links" aria-label="Principal">
      {NAV_ITEMS.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        const isPending = pendingHref === item.href && !isActive;

        return (
          <button
            key={item.href}
            type="button"
            className={`nav-link-pill ${isActive ? "nav-link-pill-active" : ""} ${isPending ? "nav-link-pill-pending" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onMouseEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            onClick={() => {
              if (isActive) {
                return;
              }

              setPendingHref(item.href);
              startTransition(() => {
                router.push(item.href);
              });
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
