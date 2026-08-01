"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

export const LAST_APP_ROUTE_KEY = "cine-semanal:last-app-route";

export function NavigationMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const previousPathname = useRef(pathname);

  useLayoutEffect(() => {
    const changedPage = previousPathname.current !== pathname;
    previousPathname.current = pathname;

    if (changedPage && !window.location.hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/peliculas/")) {
      const route = `${pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.sessionStorage.setItem(LAST_APP_ROUTE_KEY, route);
    }
  }, [pathname, query]);

  return null;
}
