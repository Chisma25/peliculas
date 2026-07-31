import type { CSSProperties } from "react";

import { FilterDropdown } from "@/components/filter-dropdown";
import { PendingFreshness } from "@/components/pending-freshness";
import { PrefetchLink } from "@/components/prefetch-link";
import { PosterImage } from "@/components/poster-image";
import { WeeklySelectionButton } from "@/components/weekly-selection-button";
import { getPendingPageDataHydrated } from "@/lib/store";
import { buildPaginationItems, formatCount } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 16;

type PendingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildPendingQuery(params: { search?: string; genre?: string; page?: number }) {
  const query = new URLSearchParams();

  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }

  if (params.genre?.trim()) {
    query.set("genre", params.genre.trim());
  }

  if (params.page && params.page > 1) {
    query.set("page", String(params.page));
  }

  const serialized = query.toString();
  return serialized ? `/pendientes?${serialized}` : "/pendientes";
}

function buildPendingPageHref(params: { search?: string; genre?: string; page?: number }) {
  return `${buildPendingQuery(params)}#lista-pendientes`;
}

export default async function PendingPage({ searchParams }: PendingPageProps) {
  const params = searchParams ? await searchParams : {};
  const search = getSingleParam(params.search).trim();
  const activeGenre = getSingleParam(params.genre).trim();
  const pageFromQuery = Number.parseInt(getSingleParam(params.page), 10);
  const currentPage = Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;

  const {
    batch,
    weeklyOptions,
    genres,
    totalPendingCount,
    filteredPendingCount,
    totalPages,
    currentPage: safePage,
    pagedPending
  } = await getPendingPageDataHydrated({
    search,
    genre: activeGenre,
    page: currentPage,
    pageSize: PAGE_SIZE
  });

  const paginationItems = buildPaginationItems(safePage, totalPages);
  const hasActiveFilters = Boolean(search || activeGenre);
  const heroMovie = weeklyOptions[0]?.movie ?? pagedPending[0];
  const heroStyle = heroMovie?.backdrop
    ? ({ "--pending-hero-image": `url("${heroMovie.backdrop}")` } as CSSProperties)
    : undefined;

  return (
    <section className="pending-page">
      <PendingFreshness />
      <header className="cinema-page-intro pending-page-intro" style={heroStyle}>
        <div className="pending-page-intro-copy">
          <p className="cinema-kicker">Filmoteca por ver</p>
          <h1>Pendientes</h1>
          <p className="pending-page-intro-note">La lista de la que sale la próxima sesión.</p>
        </div>
        <div className="pending-page-intro-ledger">
          <span>En archivo</span>
          <strong>{String(totalPendingCount).padStart(2, "0")}</strong>
          <PrefetchLink href="/explorar">Añadir películas <span aria-hidden="true">↗</span></PrefetchLink>
        </div>
      </header>

      {batch && weeklyOptions.length > 0 ? (
        <section className="pending-radar-panel" aria-label="Recomendaciones semanales">
          <div className="pending-radar-heading">
            <p className="cinema-kicker">Selección semanal</p>
            <h2>Para esta semana</h2>
          </div>

          <div
            className={`pending-radar-grid ${
              weeklyOptions.length <= 2 ? "pending-radar-grid-tight" : ""
            }`}
          >
            {weeklyOptions.map((item, index) => {
              const selected = batch.selectedMovieId === item.movie.id;
              const primaryGenre = item.movie.genres.find((genre) => genre !== "Pendiente");

              return (
                <article
                  key={item.id}
                  className={`pending-radar-card ${index === 0 ? "is-lead" : ""} ${selected ? "is-selected" : ""}`}
                >
                  <PrefetchLink href={`/peliculas/${item.movie.slug}`} className="pending-radar-link">
                    <div className="pending-radar-poster">
                      <PosterImage src={index === 0 ? item.movie.backdrop ?? item.movie.posterUrl : item.movie.posterUrl} />
                      <span className="pending-radar-rank">{String(index + 1).padStart(2, "0")}</span>
                    </div>

                    <div className="pending-radar-copy">
                      <div className="pending-radar-title-row">
                        <strong className="pending-card-title">{item.movie.title}</strong>
                        {selected ? <span className="pending-selected-pill">Elegida</span> : null}
                      </div>
                      <div className="pending-radar-practical" aria-label={`Datos prácticos de ${item.movie.title}`}>
                        <span>{item.movie.year > 0 ? item.movie.year : "Año pendiente"}</span>
                        {item.movie.durationMinutes > 0 ? <span>{item.movie.durationMinutes} min</span> : null}
                        {primaryGenre ? <span>{primaryGenre}</span> : null}
                      </div>
                    </div>
                  </PrefetchLink>

                  <form action="/api/weekly-recommendations/select" method="post" className="pending-radar-action">
                    <input type="hidden" name="batchId" value={batch.id} />
                    <input type="hidden" name="movieId" value={item.movie.id} />
                    <WeeklySelectionButton selected={selected} />
                  </form>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section id="lista-pendientes" className="pending-archive-panel" aria-label="Archivo de pendientes">
        <div className="pending-archive-heading">
          <div>
            <p className="cinema-kicker">Archivo completo</p>
            <h2>La lista</h2>
          </div>
        </div>
        {totalPendingCount > 0 || hasActiveFilters ? (
          <form action="/pendientes" method="get" className="pending-filter-panel">
            <div className="pending-filter-grid">
              <label className="pending-filter-field pending-filter-field-wide">
                Buscar por título
                <input type="search" name="search" defaultValue={search} placeholder="Interstellar, Toy Story, Whiplash..." />
              </label>

              <label className="pending-filter-field">
                Género
                <FilterDropdown
                  name="genre"
                  value={activeGenre}
                  placeholder="Todos los géneros"
                  ariaLabel="Filtrar pendientes por género"
                  options={[
                    { value: "", label: "Todos los géneros" },
                    ...genres.map((genre) => ({ value: genre, label: genre }))
                  ]}
                />
              </label>
            </div>

            <div className="pending-filter-actions">
              <button type="submit" className="primary-button">
                Aplicar filtros
              </button>
              <PrefetchLink href="/pendientes" className="ghost-button">
                Limpiar
              </PrefetchLink>
            </div>
          </form>
        ) : null}

        <div className="pending-list-anchor">
        <div className="pending-results-strip">
          <p className="status-text">
            {filteredPendingCount === totalPendingCount
              ? `${totalPendingCount} pendientes en lista.`
              : `${formatCount(filteredPendingCount, "resultado")} de ${formatCount(
                  totalPendingCount,
                  "pendiente"
                )}.`}
          </p>
          {filteredPendingCount > PAGE_SIZE ? (
            <p className="muted-copy">
              Página {safePage} de {totalPages}
            </p>
          ) : null}
        </div>

        {filteredPendingCount === 0 ? (
          <div className="pending-empty-state">
            <p className="eyebrow">Sin resultados</p>
            <h2>{totalPendingCount === 0 ? "Aún no hay películas pendientes." : "No hay pendientes con esos filtros."}</h2>
            <p className="body-copy">
              {totalPendingCount === 0
                ? "Explorad el catálogo y guardad candidatas para tenerlas preparadas antes del próximo plan."
                : "Prueba con otro género o limpia los filtros para volver a la lista completa."}
            </p>
            <div className="inline-actions">
              <PrefetchLink href="/explorar" className="secondary-button">
                Ir a explorar
              </PrefetchLink>
              {totalPendingCount > 0 ? (
                <PrefetchLink href="/pendientes" className="ghost-button">
                  Ver todas
                </PrefetchLink>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className={`pending-movie-grid ${pagedPending.length <= 2 ? "pending-movie-grid-tight" : ""}`}>
              {pagedPending.map((movie, index) => {
                const archiveNumber = (safePage - 1) * PAGE_SIZE + index + 1;

                return (
                  <article key={movie.id} className="pending-movie-card">
                    <PrefetchLink href={`/peliculas/${movie.slug}`} className="pending-movie-link">
                      <div className="pending-movie-poster">
                        <PosterImage src={movie.posterUrl} />
                        <span className="pending-archive-number">{String(archiveNumber).padStart(2, "0")}</span>
                        <span className="pending-external-score">{movie.externalRating.source} {movie.externalRating.value}</span>
                      </div>

                    <div className="pending-movie-copy">
                      <div>
                        <strong className="pending-card-title">{movie.title}</strong>
                        <p className="pending-card-meta">{movie.year > 0 ? movie.year : "Año pendiente"}</p>
                      </div>
                      {movie.genres.length > 0 ? (
                        <div className="pending-card-chips">
                          {movie.genres.slice(0, 2).map((genre) => (
                            <span key={`${movie.id}-${genre}`}>{genre}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    </PrefetchLink>

                  <div className="pending-movie-actions">
                    <form action="/api/pending/remove" method="post">
                      <input type="hidden" name="movieId" value={movie.id} />
                      <input type="hidden" name="redirectTo" value={buildPendingQuery({ search, genre: activeGenre, page: safePage })} />
                      <button type="submit" className="ghost-button">
                        Quitar
                      </button>
                    </form>
                    {batch ? (
                      <form action="/api/weekly-recommendations/select" method="post">
                        <input type="hidden" name="batchId" value={batch.id} />
                        <input type="hidden" name="movieId" value={movie.id} />
                        <WeeklySelectionButton compact selected={batch.selectedMovieId === movie.id} />
                      </form>
                    ) : null}
                  </div>
                  </article>
                );
              })}
            </div>

            {totalPages > 1 ? (
              <nav className="pagination-bar pending-pagination" aria-label="Paginación de pendientes">
                <PrefetchLink
                  href={buildPendingPageHref({ search, genre: activeGenre, page: Math.max(1, safePage - 1) })}
                  className={`pagination-side ${safePage === 1 ? "is-disabled" : ""}`}
                  aria-disabled={safePage === 1}
                >
                  Anterior
                </PrefetchLink>
                <div className="pagination-pages">
                  {paginationItems.map((item, index) =>
                    item === "ellipsis" ? (
                      <span key={`ellipsis-${index}`} className="pagination-ellipsis" aria-hidden="true">
                        ...
                      </span>
                    ) : (
                      <PrefetchLink
                        key={item}
                        href={buildPendingPageHref({ search, genre: activeGenre, page: item })}
                        className={`pagination-page ${item === safePage ? "pagination-page-active" : ""}`}
                        aria-current={item === safePage ? "page" : undefined}
                      >
                        {item}
                      </PrefetchLink>
                    )
                  )}
                </div>
                <PrefetchLink
                  href={buildPendingPageHref({ search, genre: activeGenre, page: Math.min(totalPages, safePage + 1) })}
                  className={`pagination-side ${safePage === totalPages ? "is-disabled" : ""}`}
                  aria-disabled={safePage === totalPages}
                >
                  Siguiente
                </PrefetchLink>
              </nav>
            ) : null}
          </>
        )}
        </div>
      </section>
    </section>
  );
}
