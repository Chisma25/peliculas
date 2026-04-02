"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";

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
      return "Añadir a pendientes";
  }
}

export function MovieExplorer() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [status, setStatus] = useState("Busca una película para consultar TMDb.");
  const [toast, setToast] = useState<ToastState>(null);
  const [movieStates, setMovieStates] = useState<Record<string, PendingResultStatus>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!deferredQuery.trim()) {
      setResults([]);
      setStatus("Busca una película para consultar TMDb.");
      return;
    }

    const controller = new AbortController();

    startTransition(() => {
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
        });
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
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Búsqueda libre</p>
        <h1>Explorar películas en TMDb</h1>
        <p className="body-copy">
          Busca cualquier película fuera de la lista del grupo para consultar su sinopsis, la nota externa y la carátula,
          y añadirla a pendientes si os encaja.
        </p>
      </div>

      <div className="stack-form">
        <label>
          Buscar por título
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Interstellar, Whiplash, La Haine..."
          />
        </label>
      </div>

      <p className="status-text">{isPending ? "Buscando..." : status}</p>

      <div className="catalog-grid">
        {results.map((movie) => {
          const pendingState = movieStates[movie.id] ?? "idle";
          const isActionDisabled =
            pendingState === "loading" || pendingState === "added" || pendingState === "already_pending" || pendingState === "already_watched";
          const visibleGenres = movie.genres
            .map((genre) => genre.trim())
            .filter((genre) => genre && genre.toLowerCase() !== "pendiente")
            .slice(0, 2);

          return (
            <article key={movie.id} className="catalog-card explorer-card">
              <div
                className="search-poster"
                style={
                  movie.posterUrl
                    ? {
                        backgroundImage: `linear-gradient(180deg, rgba(10, 15, 24, 0.08), rgba(10, 15, 24, 0.72)), url(${movie.posterUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center"
                      }
                    : undefined
                }
              />

              <div className="explorer-card-copy">
                <div className="stat-row explorer-card-meta">
                  <p className="eyebrow">{movie.year > 0 ? movie.year : "Año pendiente"}</p>
                  <span>
                    {movie.externalRating.source}: {movie.externalRating.value}
                  </span>
                </div>

                <strong className="explorer-card-title">{movie.title}</strong>

                {visibleGenres.length > 0 ? (
                  <div className="chips explorer-genres explorer-genres-compact">
                    {visibleGenres.map((genre) => (
                      <span key={`${movie.id}-${genre}`}>{genre}</span>
                    ))}
                  </div>
                ) : null}

                <p className="body-copy explorer-card-synopsis">
                  {movie.synopsis || "La sinopsis todavía no está disponible para esta película."}
                </p>
              </div>

              <div className="recommendation-actions explorer-card-actions">
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
                    Abrir en TMDb
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {toast ? (
        <div className={`explorer-toast explorer-toast-${toast.tone}`} role="status" aria-live="polite">
          <strong>{toast.title}</strong>
          <p>{toast.body}</p>
        </div>
      ) : null}
    </section>
  );
}
