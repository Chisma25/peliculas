"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const LAST_APP_ROUTE_KEY = "cine-semanal:last-app-route";

export function NavigationMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    if (!pathname.startsWith("/peliculas/")) {
      const route = `${pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.sessionStorage.setItem(LAST_APP_ROUTE_KEY, route);
    }
  }, [pathname, query]);

  return null;
}
