"use client";

import { useDeferredValue, useEffect, useState } from "react";

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
};

type PendingResultStatus = "idle" | "loading" | "added" | "already_pending" | "already_watched" | "error";

type ToastState = {
  tone: "success" | "info" | "error";
  title: string;
  body: string;
} | null;

function getButtonLabel(status: PendingResultStatus) {
  switch (status) {
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
      return "Añadir";
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

export function MovieExplorer() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const deferredQuery = useDeferredValue(debouncedQuery);
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [status, setStatus] = useState("Busca una película para consultar TMDb.");
  const [toast, setToast] = useState<ToastState>(null);
  const [movieStates, setMovieStates] = useState<Record<string, PendingResultStatus>>({});
  const [isSearching, setIsSearching] = useState(false);

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
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (!deferredQuery) {
      setResults([]);
      setIsSearching(false);
      setStatus("Busca una película para consultar TMDb.");
      return;
    }

    if (deferredQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      setStatus("Escribe al menos 2 caracteres para buscar.");
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    void fetch(`/api/movies/search?q=${encodeURIComponent(deferredQuery)}`, {
      signal: controller.signal
    })
      .then((response) => response.json())
      .then((payload: { results?: SearchMovie[] }) => {
        const nextResults = payload.results ?? [];
        setResults(nextResults);
        setStatus(nextResults.length > 0 ? `${nextResults.length} resultados encontrados.` : "No se han encontrado coincidencias.");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults([]);
          setStatus("No se pudo consultar TMDb en este momento.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      });

    return () => controller.abort();
  }, [deferredQuery]);

  async function addToPending(movie: SearchMovie) {
    setMovieStates((current) => ({ ...current, [movie.id]: "loading" }));

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
      setToast({
        tone:
          nextStatus === "added"
            ? "success"
            : nextStatus === "already_pending" || nextStatus === "already_watched"
              ? "info"
              : "error",
        title:
          nextStatus === "added"
            ? `${movie.title} añadida a pendientes`
            : nextStatus === "already_pending"
              ? "Esa película ya estaba guardada"
              : nextStatus === "already_watched"
                ? "Esa película ya figura en vistas"
                : "No se pudo añadir la película",
        body:
          payload.message ??
          payload.error ??
          (nextStatus === "added" ? "La hemos dejado preparada en pendientes." : "Prueba otra vez dentro de un momento.")
      });
    } catch {
      setMovieStates((current) => ({ ...current, [movie.id]: "error" }));
      setToast({
        tone: "error",
        title: "No se pudo añadir la película",
        body: "Ha fallado la conexión justo al guardarla. Prueba otra vez."
      });
    }
  }

  return (
    <section className="explore-page">
      <form className="explore-search-panel" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="explore-search-field">
          Buscar por título
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Interstellar, Whiplash, La Haine..."
            autoComplete="off"
          />
        </label>
        {query ? (
          <button type="button" className="ghost-button explore-clear-button" onClick={() => setQuery("")}>
            Limpiar
          </button>
        ) : null}
      </form>

      <div className="explore-results-strip">
        <p className="status-text">{isSearching ? "Buscando..." : status}</p>
      </div>

      <div className={`explore-grid ${results.length > 0 && results.length < 5 ? "explore-grid-tight" : ""}`}>
        {results.map((movie) => {
          const pendingState = movieStates[movie.id] ?? "idle";
          const isActionDisabled =
            pendingState === "loading" || pendingState === "added" || pendingState === "already_pending" || pendingState === "already_watched";
          const visibleGenres = movie.genres
            .map((genre) => genre.trim())
            .filter((genre) => genre && genre.toLowerCase() !== "pendiente")
            .slice(0, 2);

          return (
            <article key={movie.id} className="explorer-card">
              <div
                className="search-poster"
                style={
                  movie.posterUrl
                    ? {
                        backgroundImage: `linear-gradient(180deg, rgba(10, 15, 24, 0.04), rgba(10, 15, 24, 0.62)), url(${movie.posterUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center"
                      }
                    : undefined
                }
              />

              <div className="explorer-card-copy">
                <div className="explorer-card-meta">
                  <p>{movie.year > 0 ? movie.year : "Año pendiente"}</p>
                  <span>
                    {movie.externalRating.source}: {movie.externalRating.value}
                  </span>
                </div>

                <strong className="explorer-card-title">{movie.title}</strong>

                <div className="chips explorer-genres explorer-genres-compact">
                  {visibleGenres.length > 0 ? (
                    visibleGenres.map((genre) => <span key={`${movie.id}-${genre}`}>{genre}</span>)
                  ) : (
                    <span className="chip-placeholder">Sin género</span>
                  )}
                </div>

                <p className="body-copy explorer-card-synopsis">{formatSynopsis(movie.synopsis)}</p>
              </div>

              <div className="explorer-card-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={isActionDisabled}
                  onClick={() => {
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

      {deferredQuery.length >= 2 && !isSearching && results.length === 0 ? (
        <div className="explore-empty-state">
          <h2>No aparece esa película</h2>
          <p className="body-copy">Prueba con el título original, elimina artículos o busca solo una palabra clave.</p>
        </div>
      ) : null}

      {toast ? (
        <div className={`explorer-toast explorer-toast-${toast.tone}`} role="status" aria-live="polite">
          <strong>{toast.title}</strong>
          <p>{toast.body}</p>
        </div>
      ) : null}
    </section>
  );
}
