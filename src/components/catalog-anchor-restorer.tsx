"use client";

import { useEffect } from "react";

type CatalogAnchorRestorerProps = {
  active: boolean;
  navigationKey: string;
  targetId: string;
};

export function CatalogAnchorRestorer({ active, navigationKey, targetId }: CatalogAnchorRestorerProps) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) {
        return;
      }

      const scrollPadding = Number.parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const targetTop = target.getBoundingClientRect().top + window.scrollY - scrollPadding;
      window.scrollTo({ top: targetTop, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [active, navigationKey, targetId]);

  return null;
}
