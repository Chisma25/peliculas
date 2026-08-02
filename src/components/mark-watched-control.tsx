"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MarkWatchedControlProps = {
  movieId: string;
  movieTitle: string;
};

type MarkWatchedState = "idle" | "saving" | "saved" | "error";

export function MarkWatchedControl({ movieId, movieTitle }: MarkWatchedControlProps) {
  const router = useRouter();
  const [state, setState] = useState<MarkWatchedState>("idle");
  const [error, setError] = useState("");

  async function markAsWatched() {
    setState("saving");
    setError("");

    const formData = new FormData();
    formData.set("movieId", movieId);

    try {
      const response = await fetch("/api/watch/mark-watched", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo marcar la película como vista.");
      }

      setState("saved");
      router.refresh();
    } catch (caughtError) {
      setState("error");
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo marcar la película como vista.");
    }
  }

  if (state === "saved") {
    return (
      <span className="cinema-viewed-status" role="status" aria-live="polite">
        Vista por el grupo
      </span>
    );
  }

  return (
    <div className="cinema-watch-control">
      <button
        type="button"
        className="cinema-secondary-action"
        disabled={state === "saving"}
        onClick={() => void markAsWatched()}
        aria-label={`Marcar ${movieTitle} como vista`}
      >
        {state === "saving" ? "Guardando…" : state === "error" ? "Reintentar" : "Marcar como vista"}
      </button>
      {error ? <span className="cinema-watch-error" role="alert">{error}</span> : null}
    </div>
  );
}
