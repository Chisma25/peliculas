"use client";

import { useEffect } from "react";

import { getDirectionalSnapTarget } from "@/lib/chapter-snap";

const CHAPTER_SELECTOR = "[data-scroll-chapter]";

export function DirectionalChapterAssist() {
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 821px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let idleTimer: number | undefined;
    let direction: -1 | 1 = 1;

    const finishNearChapter = () => {
      if (!desktop.matches || reducedMotion.matches) {
        return;
      }

      const scrollPadding =
        Number.parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const snapPoints = Array.from(document.querySelectorAll<HTMLElement>(CHAPTER_SELECTOR)).map(
        (element) => element.getBoundingClientRect().top + window.scrollY - scrollPadding
      );
      const target = getDirectionalSnapTarget({
        currentPosition: window.scrollY,
        direction,
        snapPoints,
        threshold: Math.min(128, window.innerHeight * 0.16)
      });

      if (target === null) {
        return;
      }

      window.scrollTo({ top: target, behavior: "smooth" });
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < 1) {
        return;
      }

      direction = event.deltaY > 0 ? 1 : -1;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(finishNearChapter, 140);
    };

    window.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.clearTimeout(idleTimer);
    };
  }, []);

  return null;
}
