"use client";

import { useRouter } from "next/navigation";

import { LAST_APP_ROUTE_KEY } from "@/components/navigation-memory";

type ContextualBackButtonProps = {
  fallbackHref: string;
};

export function ContextualBackButton({ fallbackHref }: ContextualBackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="cinema-detail-back"
      onClick={() => {
        const originRoute = window.sessionStorage.getItem(LAST_APP_ROUTE_KEY) ?? "";
        if (originRoute && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(originRoute || fallbackHref);
      }}
      aria-label="Volver a la pantalla anterior"
    >
      <span aria-hidden="true">←</span>
      Volver
    </button>
  );
}
