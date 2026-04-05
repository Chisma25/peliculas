"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/vistas", label: "Vistas" },
  { href: "/pendientes", label: "Pendientes" },
  { href: "/explorar", label: "Explorar" },
  { href: "/grupo", label: "Grupo" }
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PrimaryNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    const prefetchAll = () => {
      for (const item of NAV_ITEMS) {
        if (!isActivePath(pathname, item.href)) {
          router.prefetch(item.href);
        }
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(prefetchAll, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(prefetchAll, 250);
    return () => globalThis.clearTimeout(timeoutId);
  }, [pathname, router]);

  return (
    <nav className="nav-links" aria-label="Principal">
      {NAV_ITEMS.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        const isPending = pendingHref === item.href && !isActive;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className={`nav-link-pill ${isActive ? "nav-link-pill-active" : ""} ${isPending ? "nav-link-pill-pending" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onMouseEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
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
