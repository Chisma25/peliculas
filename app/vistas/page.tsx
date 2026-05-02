import { FilterDropdown } from "@/components/filter-dropdown";
import { PrefetchLink } from "@/components/prefetch-link";
import { getSessionUser, getViewedPageDataHydrated } from "@/lib/store";
import { buildPaginationItems, formatScore, formatShortDate } from "@/lib/utils";

const PAGE_SIZE = 15;

type SeenPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const SORT_OPTIONS = [
  { value: "watched-desc", label: "Ultima registrada primero" },
  { value: "group-desc", label: "Grupo: mayor a menor" },
  { value: "group-asc", label: "Grupo: menor a mayor" },
  { value: "mine-desc", label: "Mi nota: mayor a menor" },
  { value: "mine-asc", label: "Mi nota: menor a mayor" }
] as const;

function getSingleParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isValidSort(value: string): value is (typeof SORT_OPTIONS)[number]["value"] {
  return SORT_OPTIONS.some((option) => option.value === value);
}

function buildSeenQuery(params: {
  search?: string;
  year?: string;
  genre?: string;
  sort?: string;
  page?: number;
}) {
  const query = new URLSearchParams();

  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }

  if (params.year?.trim()) {
    query.set("year", params.year.trim());
  }

  if (params.genre?.trim()) {
    query.set("genre", params.genre.trim());
  }

  if (params.sort?.trim()) {
    query.set("sort", params.sort.trim());
  }

  if (params.page && params.page > 1) {
    query.set("page", String(params.page));
  }

  const serialized = query.toString();
  return serialized ? `/vistas?${serialized}` : "/vistas";
}

export default async function SeenPage({ searchParams }: SeenPageProps) {
  const params = searchParams ? await searchParams : {};
  const search = getSingleParam(params.search).trim();
  const year = getSingleParam(params.year).trim();
  const genre = getSingleParam(params.genre).trim();
  const sortFromQuery = getSingleParam(params.sort).trim();
  const activeSort = isValidSort(sortFromQuery) ? sortFromQuery : "watched-desc";
  const pageFromQuery = Number.parseInt(getSingleParam(params.page), 10);
  const currentPage = Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;

  const sessionUser = await getSessionUser();
  const { genres, totalHistoryCount, filteredHistoryCount, totalPages, currentPage: safePage, pagedHistory } =
    await getViewedPageDataHydrated({
      search,
      year,
      genre,
      sort: activeSort,
      currentUserId: sessionUser?.id,
      page: currentPage,
      pageSize: PAGE_SIZE
    });

  const paginationItems = buildPaginationItems(safePage, totalPages);

  return (
    <section className="seen-page">
      <section id="archivo-vistas" className="seen-archive-panel" aria-label="Archivo de vistas">
        <form action="/vistas" method="get" className="seen-toolbar">
          <div className="seen-filter-grid">
            <label className="seen-field seen-field-wide">
              Buscar por titulo
              <input type="search" name="search" defaultValue={search} placeholder="Pulp Fiction, Soul, Interstellar..." />
            </label>
            <label className="seen-field">
              Ano
              <input type="text" name="year" defaultValue={year} placeholder="2022" inputMode="numeric" />
            </label>
            <label className="seen-field">
              Genero
              <FilterDropdown
                name="genre"
                value={genre}
                placeholder="Todos los generos"
                ariaLabel="Filtrar vistas por genero"
                options={[
                  { value: "", label: "Todos los generos" },
                  ...genres.map((item) => ({ value: item, label: item }))
                ]}
              />
            </label>
            <label className="seen-field">
              Orden
              <FilterDropdown
                name="sort"
                value={activeSort}
                placeholder="Ordenar"
                ariaLabel="Ordenar peliculas vistas"
                options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              />
            </label>
          </div>

          <div className="seen-toolbar-actions">
            <button type="submit" className="primary-button">
              Aplicar filtros
            </button>
            <PrefetchLink href="/vistas" className="ghost-button">
              Limpiar
            </PrefetchLink>
          </div>
        </form>

        <div className="seen-list-anchor">
          <div className="seen-results-strip">
            <p className="status-text">
              {filteredHistoryCount === totalHistoryCount
                ? `${totalHistoryCount} peliculas vistas en total.`
                : `${filteredHistoryCount} resultados de ${totalHistoryCount} peliculas vistas.`}
            </p>
            {filteredHistoryCount > PAGE_SIZE ? (
              <p className="muted-copy">
                Pagina {safePage} de {totalPages}
              </p>
            ) : null}
          </div>

          {filteredHistoryCount === 0 ? (
            <div className="seen-empty-state">
              <p className="eyebrow">Sin resultados</p>
              <h2>No hay peliculas vistas que encajen con esos filtros.</h2>
              <p className="body-copy">Prueba a quitar el ano, el genero o parte del titulo para volver al archivo completo.</p>
              <div className="inline-actions">
                <PrefetchLink href="/vistas" className="ghost-button">
                  Ver todas
                </PrefetchLink>
              </div>
            </div>
          ) : (
            <>
              <div className={`seen-grid ${pagedHistory.length <= 2 ? "seen-grid-tight" : ""}`}>
                {pagedHistory.map((item) => {
                  const watchedDate = item.watchedOn ? formatShortDate(item.watchedOn) : "Fecha pendiente";

                  return (
                    <PrefetchLink key={item.movie.id} href={`/peliculas/${item.movie.slug}`} className="seen-card-link">
                      <article className="seen-card">
                        <div
                          className="seen-card-poster"
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
                          <span>{watchedDate}</span>
                        </div>

                        <div className="seen-card-copy">
                          <div>
                            <strong className="seen-card-title">{item.movie.title}</strong>
                            <p className="seen-card-subline">{item.movie.year > 0 ? item.movie.year : "Ano pendiente"}</p>
                          </div>

                          <div className="seen-card-score-grid">
                            <div className="seen-card-score-pill">
                              <small>Grupo</small>
                              <strong>{formatScore(item.groupAverage)}</strong>
                            </div>
                            <div className="seen-card-score-pill seen-card-score-pill-user">
                              <small>Tu nota</small>
                              <strong>{typeof item.userRating === "number" ? formatScore(item.userRating) : "-"}</strong>
                            </div>
                          </div>
                        </div>
                      </article>
                    </PrefetchLink>
                  );
                })}
              </div>

              {totalPages > 1 ? (
                <nav className="pagination-bar seen-pagination" aria-label="Paginacion de vistas">
                  <PrefetchLink
                    href={buildSeenQuery({ search, year, genre, sort: activeSort, page: Math.max(1, safePage - 1) })}
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
                          href={buildSeenQuery({ search, year, genre, sort: activeSort, page: item })}
                          className={`pagination-page ${item === safePage ? "pagination-page-active" : ""}`}
                          aria-current={item === safePage ? "page" : undefined}
                        >
                          {item}
                        </PrefetchLink>
                      )
                    )}
                  </div>
                  <PrefetchLink
                    href={buildSeenQuery({ search, year, genre, sort: activeSort, page: Math.min(totalPages, safePage + 1) })}
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
