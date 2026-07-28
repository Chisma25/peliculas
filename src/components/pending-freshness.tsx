"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { PENDING_REFRESHED_AT_KEY, PENDING_UPDATED_AT_KEY, PENDING_UPDATED_EVENT } from "@/lib/pending-sync";

export function PendingFreshness() {
  const router = useRouter();

  useEffect(() => {
    function refreshIfStale() {
      const updatedAt = Number.parseInt(window.sessionStorage.getItem(PENDING_UPDATED_AT_KEY) ?? "0", 10);
      const refreshedAt = Number.parseInt(window.sessionStorage.getItem(PENDING_REFRESHED_AT_KEY) ?? "0", 10);
      if (!Number.isFinite(updatedAt) || updatedAt <= refreshedAt) {
        return;
      }

      window.sessionStorage.setItem(PENDING_REFRESHED_AT_KEY, String(updatedAt));
      router.refresh();
    }

    refreshIfStale();
    window.addEventListener(PENDING_UPDATED_EVENT, refreshIfStale);
    return () => window.removeEventListener(PENDING_UPDATED_EVENT, refreshIfStale);
  }, [router]);

  return null;
}
