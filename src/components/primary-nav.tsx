"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { PENDING_WRITE_EVENT, type PendingWriteEventDetail } from "@/lib/pending-sync";

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
  const activePendingWrites = useRef(0);
  const queuedPendingNavigation = useRef(false);

  useEffect(() => {
    function handlePendingWrite(event: Event) {
      const detail = (event as CustomEvent<PendingWriteEventDetail>).detail;
      activePendingWrites.current =
        detail.phase === "start" ? activePendingWrites.current + 1 : Math.max(0, activePendingWrites.current - 1);

      if (detail.phase === "finish" && activePendingWrites.current === 0 && queuedPendingNavigation.current) {
        queuedPendingNavigation.current = false;
        router.push("/pendientes");
      }
    }

    window.addEventListener(PENDING_WRITE_EVENT, handlePendingWrite);
    return () => window.removeEventListener(PENDING_WRITE_EVENT, handlePendingWrite);
  }, [router]);

  return (
    <nav className="nav-links" aria-label="Principal">
      {NAV_ITEMS.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        const isPending = pendingHref === item.href && !isActive;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`nav-link-pill ${isActive ? "nav-link-pill-active" : ""} ${isPending ? "nav-link-pill-pending" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onMouseEnter={() => {
              if (item.href !== "/pendientes") {
                router.prefetch(item.href);
              }
            }}
            onFocus={() => {
              if (item.href !== "/pendientes") {
                router.prefetch(item.href);
              }
            }}
            onClick={(event) => {
              if (item.href === "/pendientes" && activePendingWrites.current > 0) {
                event.preventDefault();
                queuedPendingNavigation.current = true;
                setPendingHref(item.href);
                return;
              }

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
