"use client";

import { useEffect, useRef, useState } from "react";

import { PosterImage } from "@/components/poster-image";
import { announcePendingUpdated, announcePendingWrite } from "@/lib/pending-sync";

type DiscoveryMovie = {
  id: string;
  slug: string;
  title: string;
  year: number;
  synopsis: string;
  durationMinutes: number;
  genres: string[];
  director: string;
  cast: string[];
  language: string;
  country: string;
  posterUrl?: string;
  backdrop?: string;
  externalRating: { source: string; value: string };
  sourceIds?: { tmdb?: string };
};

type DiscoveryStatus = "idle" | "loading" | "success" | "error";
type AddStatus = "idle" | "loading" | "added" | "already_pending" | "already_watched" | "error";

function addLabel(status: AddStatus) {
  if (status === "loading") return "Añadiendo...";
  if (status === "added") return "Añadida";
  if (status === "already_pending") return "Ya en pendientes";
  if (status === "already_watched") return "Ya vista";
  if (status === "error") return "Reintentar";
  return "Añadir a pendientes";
}

export function MovieDiscovery() {
  const [status, setStatus] = useState<DiscoveryStatus>("idle");
  const [movies, setMovies] = useState<DiscoveryMovie[]>([]);
  const [generation, setGeneration] = useState(0);
  const [message, setMessage] = useState("");
  const [addStates, setAddStates] = useState<Record<string, AddStatus>>({});
  const shownTmdbIds = useRef(new Set<string>());
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  async function generateSelection(nextGeneration: number) {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setStatus("loading");
    setMessage("");

    const exclude = [...shownTmdbIds.current].join(",");
    const params = new URLSearchParams({ generation: String(nextGeneration) });
    if (exclude) params.set("exclude", exclude);

    try {
      const response = await fetch(`/api/movies/discover?${params}`, {
        signal: controller.signal,
        cache: "no-store"
      });
      const payload = (await response.json()) as { results?: DiscoveryMovie[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo generar la selección.");

      const nextMovies = payload.results ?? [];
      for (const movie of nextMovies) {
        if (movie.sourceIds?.tmdb) shownTmdbIds.current.add(movie.sourceIds.tmdb);
      }
      setMovies(nextMovies);
      setGeneration(nextGeneration);
      setAddStates({});
      setStatus("success");
      setMessage(
        nextMovies.length > 0
          ? "Selección preparada."
          : "No quedan suficientes películas distintas en esta vuelta."
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo generar la selección.");
    }
  }

  async function addToPending(movie: DiscoveryMovie) {
    setAddStates((current) => ({ ...current, [movie.id]: "loading" }));
    announcePendingWrite("start");

    try {
      const response = await fetch("/api/pending/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movie)
      });
      const payload = (await response.json()) as { status?: AddStatus; error?: string };
      const nextStatus = payload.status ?? (response.ok ? "added" : "error");
      setAddStates((current) => ({ ...current, [movie.id]: nextStatus }));
      if (nextStatus === "added") announcePendingUpdated();
      if (nextStatus === "error") setMessage(payload.error ?? "No se pudo añadir la película.");
    } catch {
      setAddStates((current) => ({ ...current, [movie.id]: "error" }));
      setMessage("Ha fallado la conexión al añadir la película.");
    } finally {
      announcePendingWrite("finish");
    }
  }

  const hasMovies = status === "success" && movies.length > 0;

  return (
    <section
      id="descubrimiento"
      className={`discovery-room discovery-room-${status}`}
      aria-labelledby="discovery-title"
      data-scroll-chapter
    >
      <nav className="cinema-chapter-nav discovery-chapter-nav" aria-label="Ir a la siguiente sección">
        <a href="#explorar-peliculas" aria-label="Bajar a explorar películas"><span aria-hidden="true">↓</span></a>
      </nav>
      <div className="discovery-heading">
        <div>
          <p className="cinema-kicker">Descubrimiento</p>
          <h1 id="discovery-title">{hasMovies ? "Para descubrir" : "Encontrar algo nuevo"}</h1>
        </div>
        <div className="discovery-heading-action">
          <p>{hasMovies ? "Cinco películas fuera de vuestra lista." : "Una selección basada en el gusto del grupo."}</p>
          <button
            type="button"
            className="discovery-generate-button"
            disabled={status === "loading"}
            onClick={() => void generateSelection(hasMovies ? generation + 1 : generation)}
          >
            {status === "loading" ? "Buscando..." : hasMovies ? "Ver otras" : "Generar selección"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>

      {status === "loading" ? (
        <div className="discovery-grid discovery-grid-loading" aria-label="Preparando recomendaciones">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="discovery-card discovery-card-skeleton" key={index} aria-hidden="true">
              <div className="discovery-poster skeleton-block" />
              <span className="skeleton-line skeleton-line-title" />
              <span className="skeleton-line skeleton-line-short" />
            </div>
          ))}
        </div>
      ) : null}

      {hasMovies ? (
        <div className="discovery-grid">
          {movies.map((movie) => {
            const addStatus = addStates[movie.id] ?? "idle";
            const disabled = ["loading", "added", "already_pending", "already_watched"].includes(addStatus);
            return (
              <article className="discovery-card" key={movie.id}>
                <div className="discovery-poster">
                  <PosterImage src={movie.posterUrl} />
                  <span className="discovery-rating">{movie.externalRating.value}</span>
                </div>
                <div className="discovery-card-copy">
                  <p className="discovery-meta">
                    <span>{movie.year || "—"}</span>
                    <span>{movie.genres.slice(0, 2).join(" / ")}</span>
                  </p>
                  <h3>{movie.title}</h3>
                </div>
                <div className="discovery-card-actions">
                  <button type="button" disabled={disabled} onClick={() => void addToPending(movie)}>
                    {addLabel(addStatus)}
                  </button>
                  {movie.sourceIds?.tmdb ? (
                    <a href={`https://www.themoviedb.org/movie/${movie.sourceIds.tmdb}`} target="_blank" rel="noreferrer">
                      TMDb
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {status === "error" || (status === "success" && movies.length === 0) ? (
        <div className="discovery-feedback">
          <p>{message}</p>
          <button type="button" onClick={() => void generateSelection(generation + 1)}>Probar otra vez</button>
        </div>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
