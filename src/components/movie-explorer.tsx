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

export function MovieExplorer() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [status, setStatus] = useState("Busca una película para consultar TMDb.");
  const [actionMessage, setActionMessage] = useState("");
  const [isPending, startTransition] = useTransition();

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
    const response = await fetch("/api/pending/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(movie)
    });

    const payload = (await response.json()) as { message?: string; error?: string };
    setActionMessage(payload.message ?? payload.error ?? "No se pudo añadir la película.");
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Búsqueda libre</p>
        <h1>Explorar películas en TMDb</h1>
        <p className="body-copy">
          Busca cualquier película fuera de las recomendaciones semanales para consultar sinopsis, nota externa y
          carátula, y añadirla a pendientes.
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
      {actionMessage ? <p className="status-text">{actionMessage}</p> : null}

      <div className="catalog-grid">
        {results.map((movie) => (
          <article key={movie.id} className="catalog-card">
            <div
              className="search-poster"
              style={
                movie.posterUrl
                  ? {
                      backgroundImage: `linear-gradient(180deg, rgba(10, 15, 24, 0.1), rgba(10, 15, 24, 0.7)), url(${movie.posterUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }
                  : undefined
              }
            />
            <div className="stat-row">
              <p className="eyebrow">{movie.year > 0 ? movie.year : "Año pendiente"}</p>
              <span>
                {movie.externalRating.source}: {movie.externalRating.value}
              </span>
            </div>
            <strong>{movie.title}</strong>
            <p className="body-copy">{movie.synopsis}</p>
            <div className="recommendation-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void addToPending(movie);
                }}
              >
                Añadir a pendientes
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
        ))}
      </div>
    </section>
  );
}
