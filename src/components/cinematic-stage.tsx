"use client";

import type { PointerEvent, ReactNode } from "react";
import { useRef } from "react";

type CinematicStageProps = {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
};

export function CinematicStage({ children, className = "", labelledBy }: CinematicStageProps) {
  const stageRef = useRef<HTMLElement>(null);

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const stage = stageRef.current;
    if (!stage || event.pointerType === "touch") {
      return;
    }

    const bounds = stage.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    stage.style.setProperty("--cinema-shift-x", `${(x * -14).toFixed(2)}px`);
    stage.style.setProperty("--cinema-shift-y", `${(y * -10).toFixed(2)}px`);
  }

  function resetPointer() {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    stage.style.setProperty("--cinema-shift-x", "0px");
    stage.style.setProperty("--cinema-shift-y", "0px");
  }

  return (
    <section
      ref={stageRef}
      className={className}
      aria-labelledby={labelledBy}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      {children}
    </section>
  );
}
