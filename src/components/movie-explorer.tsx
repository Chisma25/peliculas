"use client";

/* eslint-disable react-hooks/set-state-in-effect -- This effect owns the lifecycle of an external TMDb request. */

import { useDeferredValue, useEffect, useRef, useState } from "react";

import { PosterImage } from "@/components/poster-image";
import { MovieDiscovery } from "@/components/movie-discovery";
import { announcePendingUpdated, announcePendingWrite } from "@/lib/pending-sync";

type SearchMovie = {
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
  trailerUrl?: string;
  posterUrl?: string;
  backdrop?: string;
  externalRating: {
    source: string;
    value: string;
  };
  sourceIds?: {
    tmdb?: string;
  };
  collectionStatus?: "already_pending" | "already_watched";
};

type PendingResultStatus = "idle" | "confirming" | "loading" | "added" | "already_pending" | "already_watched" | "error";
type SearchStatus = "idle" | "loading" | "success" | "error";

type ToastState = {
  tone: "success" | "info" | "error";
  label: string;
  title: string;
  body?: string;
} | null;

function getButtonLabel(status: PendingResultStatus) {
  switch (status) {
    case "confirming":
      return "Añadir igualmente";
    case "loading":
      return "Añadiendo...";
    case "added":
      return "Añadida";
    case "already_pending":
      return "Ya en pendientes";
    case "already_watched":
      return "Ya vista";
    case "error":
      return "Reintentar";
    default:
      return "Añadir a pendientes";
  }
}

function formatSynopsis(synopsis: string, maxLength = 145) {
  const fallback = "La sinopsis todavía no está disponible para esta película.";
  const cleanSynopsis = (synopsis || fallback).replace(/\s+/g, " ").trim();

  if (cleanSynopsis.length <= maxLength) {
    return cleanSynopsis;
  }

  const trimmed = cleanSynopsis.slice(0, maxLength).replace(/[\s,.;:!?-]+$/u, "");
  return `${trimmed}...`;
}

function hasLimitedMetadata(movie: SearchMovie) {
  const externalScore = Number.parseInt(movie.externalRating.value.replace(/\D/g, ""), 10);
  return !movie.posterUrl || movie.year <= 0 || !Number.isFinite(externalScore) || externalScore <= 0;
}

export function MovieExplorer() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const deferredQuery = useDeferredValue(debouncedQuery);
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [status, setStatus] = useState("Busca una película para consultar TMDb.");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [retryCount, setRetryCount] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [movieStates, setMovieStates] = useState<Record<string, PendingResultStatus>>({});
  const searchCache = useRef(new Map<string, SearchMovie[]>());

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    setRetryCount(0);
    setMovieStates({});
  }

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 280);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (!deferredQuery) {
      setResults([]);
      setSearchStatus("idle");
      setStatus("Busca una película para consultar TMDb.");
      return;
    }

    if (deferredQuery.length < 2) {
      setResults([]);
      setSearchStatus("idle");
      setStatus("Escribe al menos 2 caracteres para buscar.");
      return;
    }

    const cacheKey = deferredQuery.toLocaleLowerCase("es");
    const cachedResults = searchCache.current.get(cacheKey);
    if (cachedResults && retryCount === 0) {
      setResults(cachedResults);
      setSearchStatus("success");
      setStatus(cachedResults.length > 0 ? `${cachedResults.length} resultados encontrados.` : "No se han encontrado coincidencias.");
      return;
    }

    const controller = new AbortController();
    setSearchStatus("loading");
    setStatus(`Buscando “${deferredQuery}”…`);

    void fetch(`/api/movies/search?q=${encodeURIComponent(deferredQuery)}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as { results?: SearchMovie[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudo consultar TMDb en este momento.");
        }
        return payload.results ?? [];
      })
      .then((nextResults) => {
        searchCache.current.set(cacheKey, nextResults);
        setResults(nextResults);
        setSearchStatus("success");
        setStatus(nextResults.length > 0 ? `${nextResults.length} resultados encontrados.` : "No se han encontrado coincidencias.");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResults([]);
          setSearchStatus("error");
          setStatus(error instanceof Error ? error.message : "No se pudo consultar TMDb en este momento.");
        }
      });

    return () => controller.abort();
  }, [deferredQuery, retryCount]);

  async function addToPending(movie: SearchMovie) {
    setMovieStates((current) => ({ ...current, [movie.id]: "loading" }));
    announcePendingWrite("start");

    try {
      const response = await fetch("/api/pending/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(movie)
      });

      const payload = (await response.json()) as { status?: PendingResultStatus; message?: string; error?: string };
      const nextStatus = payload.status ?? (response.ok ? "added" : "error");

      setMovieStates((current) => ({ ...current, [movie.id]: nextStatus }));
      if (nextStatus === "added") {
        announcePendingUpdated();
      }
      setToast({
        tone:
          nextStatus === "added"
            ? "success"
            : nextStatus === "already_pending" || nextStatus === "already_watched"
              ? "info"
              : "error",
        label:
          nextStatus === "added"
            ? "Añadida a pendientes"
            : nextStatus === "already_pending"
              ? "Ya estaba en pendientes"
              : nextStatus === "already_watched"
                ? "Ya está en vistas"
                : "No se pudo añadir",
        title:
          movie.title,
        body: nextStatus === "error" ? payload.error ?? payload.message ?? "Prueba otra vez dentro de un momento." : undefined
      });
    } catch {
      setMovieStates((current) => ({ ...current, [movie.id]: "error" }));
      setToast({
        tone: "error",
        label: "No se pudo añadir",
        title: movie.title,
        body: "Ha fallado la conexión justo al guardarla. Prueba otra vez."
      });
    } finally {
      announcePendingWrite("finish");
    }
  }

  return (
    <section className={`explore-page ${query ? "explore-page-active" : "explore-page-idle"}`}>
      <header className="explore-cinematic-intro">
        <p className="cinema-kicker">Explorar TMDb</p>
        <h1>Buscar películas</h1>
      </header>

      <MovieDiscovery />

      <form className="explore-search-panel" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="explore-search-field">
          Buscar por título
          <input
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Interstellar, Whiplash, La Haine..."
            autoComplete="off"
          />
        </label>
        {query ? (
          <button type="button" className="ghost-button explore-clear-button" onClick={() => updateQuery("")}>
            Limpiar
          </button>
        ) : null}
      </form>

      {query ? (
        <div className="explore-results-strip">
          <p className={`status-text ${searchStatus === "error" ? "status-text-error" : ""}`} role="status" aria-live="polite">
            {status}
          </p>
          {searchStatus === "error" ? (
            <button type="button" className="secondary-button explore-retry-button" onClick={() => setRetryCount((value) => value + 1)}>
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      {searchStatus === "loading" ? (
        <div className="explore-grid explore-skeleton-grid" aria-label="Cargando resultados">
          {Array.from({ length: 4 }, (_, index) => (
            <article className="explorer-card explorer-card-skeleton" key={index} aria-hidden="true">
              <div className="search-poster skeleton-block" />
              <div className="explorer-card-copy">
                <span className="skeleton-line skeleton-line-short" />
                <span className="skeleton-line skeleton-line-title" />
                <span className="skeleton-line" />
                <span className="skeleton-line skeleton-line-medium" />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={`explore-grid ${results.length > 0 && results.length < 5 ? "explore-grid-tight" : ""}`}>
          {results.map((movie, index) => {
            const pendingState = movieStates[movie.id] ?? movie.collectionStatus ?? "idle";
            const limitedMetadata = hasLimitedMetadata(movie);
            const isActionDisabled =
              pendingState === "loading" ||
              pendingState === "added" ||
              pendingState === "already_pending" ||
              pendingState === "already_watched";
            const visibleGenres = movie.genres
              .map((genre) => genre.trim())
              .filter((genre) => genre && genre.toLowerCase() !== "pendiente")
              .slice(0, 2);

            return (
              <article key={movie.id} className="explorer-card">
                <div className="search-poster">
                  <PosterImage src={movie.posterUrl} />
                  <span className="explorer-card-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <span className="explorer-card-rating">
                    {movie.externalRating.source} {movie.externalRating.value}
                  </span>
                </div>

                <div className="explorer-card-copy">
                  <div className="explorer-card-meta">
                    <p>{movie.year > 0 ? movie.year : "Año pendiente"}</p>
                    {visibleGenres.length > 0 ? <span>{visibleGenres.join(" / ")}</span> : null}
                  </div>

                  <strong className="explorer-card-title">{movie.title}</strong>

                  <p className="body-copy explorer-card-synopsis">{formatSynopsis(movie.synopsis)}</p>
                  {limitedMetadata ? (
                    <p className={`search-quality-note ${pendingState === "confirming" ? "search-quality-note-active" : ""}`}>
                      {pendingState === "confirming"
                        ? "TMDb ofrece pocos datos para esta coincidencia. Confirma solo si es la película correcta."
                        : "Coincidencia con información limitada."}
                    </p>
                  ) : null}
                </div>

                <div className="explorer-card-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isActionDisabled}
                    onClick={() => {
                      if (limitedMetadata && pendingState === "idle") {
                        setMovieStates((current) => ({ ...current, [movie.id]: "confirming" }));
                        return;
                      }
                      void addToPending(movie);
                    }}
                  >
                    {getButtonLabel(pendingState)}
                  </button>
                  {movie.sourceIds?.tmdb ? (
                    <a
                      href={`https://www.themoviedb.org/movie/${movie.sourceIds.tmdb}`}
                      target="_blank"
                      rel="noreferrer"
                      className="secondary-button"
                    >
                      TMDb
                    </a>
                  ) : (
                    <span className="secondary-button secondary-button-placeholder">Sin enlace</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {deferredQuery.length >= 2 && searchStatus === "success" && results.length === 0 ? (
        <div className="explore-empty-state">
          <h2>No aparece esa película</h2>
          <p className="body-copy">Prueba con el título original, elimina artículos o busca solo una palabra clave.</p>
        </div>
      ) : null}

      {toast ? (
        <div className={`explorer-toast explorer-toast-${toast.tone}`} role="status" aria-live="polite">
          <span className="explorer-toast-label">{toast.label}</span>
          <strong>{toast.title}</strong>
          {toast.body ? <p>{toast.body}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
