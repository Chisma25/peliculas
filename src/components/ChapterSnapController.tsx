"use client";

import { useEffect } from "react";

type ChapterSnapControllerProps = {
  mode?: "nearest" | "nearby";
  releaseAfterLast?: boolean;
  targets: string[];
};

export function ChapterSnapController({
  mode = "nearest",
  releaseAfterLast = false,
  targets
}: ChapterSnapControllerProps) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 821px)");
    let settling = false;
    let releaseTimer: number | undefined;
    let scrollIdleTimer: number | undefined;

    const settleOnNearestChapter = () => {
      if (settling || reducedMotion.matches || !desktop.matches) {
        return;
      }

      const scrollPadding = Number.parseFloat(
        window.getComputedStyle(document.documentElement).scrollPaddingTop
      ) || 0;
      const snapPoints = targets
        .map((selector) => document.querySelector<HTMLElement>(selector))
        .filter((element): element is HTMLElement => Boolean(element))
        .map((element) => element.getBoundingClientRect().top + window.scrollY - scrollPadding);

      if (snapPoints.length === 0) {
        return;
      }

      const archiveStart = snapPoints.at(-1) ?? 0;

      // The archive is intentionally taller than one viewport. Once the user is
      // reading it, snapping must not pull the page back to its opening frame.
      if (releaseAfterLast && window.scrollY > archiveStart + window.innerHeight * 0.4) {
        return;
      }

      const nearestPoint = snapPoints.reduce((nearest, point) =>
        Math.abs(point - window.scrollY) < Math.abs(nearest - window.scrollY) ? point : nearest
      );

      if (Math.abs(nearestPoint - window.scrollY) < 2) {
        return;
      }

      if (mode === "nearby" && Math.abs(nearestPoint - window.scrollY) > window.innerHeight * 0.16) {
        return;
      }

      settling = true;
      window.scrollTo({ top: nearestPoint, behavior: "smooth" });
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        settling = false;
      }, 650);
    };

    const queueSettlement = () => {
      if (settling) {
        return;
      }

      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(settleOnNearestChapter, 160);
    };

    const supportsScrollEnd = "onscrollend" in window;

    if (supportsScrollEnd) {
      window.addEventListener("scrollend", settleOnNearestChapter);
    } else {
      window.addEventListener("scroll", queueSettlement, { passive: true });
    }

    return () => {
      if (supportsScrollEnd) {
        window.removeEventListener("scrollend", settleOnNearestChapter);
      } else {
        window.removeEventListener("scroll", queueSettlement);
      }

      window.clearTimeout(releaseTimer);
      window.clearTimeout(scrollIdleTimer);
    };
  }, [mode, releaseAfterLast, targets]);

  return null;
}
