import { FilterDropdown } from "@/components/filter-dropdown";
import { PrefetchLink } from "@/components/prefetch-link";
import { getPendingPageDataHydrated } from "@/lib/store";
import { buildPaginationItems } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 15;

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

  return (
    <section className="pending-page">
      {batch && weeklyOptions.length > 0 ? (
        <section className="pending-radar-panel" aria-label="Radar semanal de pendientes">
          <p className="eyebrow pending-radar-eyebrow">Radar semanal</p>

          <div className="pending-radar-grid">
            {weeklyOptions.map((item, index) => (
              <article
                key={item.id}
                className={`pending-radar-card ${batch.selectedMovieId === item.movie.id ? "is-selected" : ""}`}
              >
                <PrefetchLink href={`/peliculas/${item.movie.slug}`} className="pending-radar-link">
                  <div
                    className="pending-radar-poster"
                    style={
                      item.movie.posterUrl
                        ? {
                            backgroundImage: `linear-gradient(180deg, rgba(10, 15, 24, 0.06), rgba(10, 15, 24, 0.68)), url(${item.movie.posterUrl})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center"
                          }
                        : undefined
                    }
                  >
                    <span>{index + 1}</span>
                  </div>

                  <div className="pending-radar-copy">
                    <strong className="pending-card-title">{item.movie.title}</strong>
                    <p className="pending-card-meta">{item.movie.year > 0 ? item.movie.year : "Año pendiente"}</p>
                    {item.movie.genres.length > 0 ? (
                      <div className="pending-card-chips">
                        {item.movie.genres.slice(0, 2).map((genre) => (
                          <span key={`${item.movie.id}-${genre}`}>{genre}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </PrefetchLink>

                <form action="/api/weekly-recommendations/select" method="post" className="pending-radar-action">
                  <input type="hidden" name="batchId" value={batch.id} />
                  <input type="hidden" name="movieId" value={item.movie.id} />
                  <button type="submit" className="primary-button">
                    {batch.selectedMovieId === item.movie.id ? "Ya elegida" : "Elegir"}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section id="lista-pendientes" className="pending-archive-panel" aria-label="Archivo de pendientes">
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

        <div className="pending-list-anchor">
        <div className="pending-results-strip">
          <p className="status-text">
            {filteredPendingCount === totalPendingCount
              ? `${totalPendingCount} pendientes en lista.`
              : `${filteredPendingCount} resultados de ${totalPendingCount} pendientes.`}
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
              {pagedPending.map((movie) => (
                <article key={movie.id} className="pending-movie-card">
                  <PrefetchLink href={`/peliculas/${movie.slug}`} className="pending-movie-link">
                    <div
                      className="pending-movie-poster"
                      style={
                        movie.posterUrl
                          ? {
                              backgroundImage: `linear-gradient(180deg, rgba(10, 15, 24, 0.06), rgba(10, 15, 24, 0.72)), url(${movie.posterUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center"
                            }
                          : undefined
                      }
                    >
                      <span>{movie.externalRating.source} {movie.externalRating.value}</span>
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
                        <button type="submit" className="primary-button">
                          Elegir
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              ))}
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
