import Link from "next/link";

import { getSessionUser, getViewedPageDataHydrated } from "@/lib/store";
import { buildPaginationItems, formatScore, formatShortDate } from "@/lib/utils";

const PAGE_SIZE = 15;

type SeenPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const SORT_OPTIONS = [
  { value: "watched-desc", label: "Última vista primero" },
  { value: "group-desc", label: "Grupo: mayor a menor" },
  { value: "group-asc", label: "Grupo: menor a mayor" },
  { value: "mine-desc", label: "Mi nota: mayor a menor" },
  { value: "mine-asc", label: "Mi nota: menor a mayor" }
] as const;

function getSingleParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isValidSort(
  value: string
): value is (typeof SORT_OPTIONS)[number]["value"] {
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
  const { history, allHistory, genres } = await getViewedPageDataHydrated({
    search,
    year,
    genre,
    sort: activeSort,
    currentUserId: sessionUser?.id,
    page: currentPage,
    pageSize: PAGE_SIZE
  });

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedHistory = history.slice(pageStart, pageStart + PAGE_SIZE);
  const paginationItems = buildPaginationItems(safePage, totalPages);

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Vistas del grupo</p>
        <h1>Películas vistas y notas</h1>
        <p className="body-copy">Todo lo que ya habéis visto, ordenado para consultar rápido notas, fechas y ficha.</p>
      </div>

      <form action="/vistas" method="get" className="pending-toolbar history-toolbar">
        <div className="history-toolbar-fields">
          <label className="pending-search-field">
            Buscar por título
            <input type="search" name="search" defaultValue={search} placeholder="Pulp Fiction, Soul, Interstellar..." />
          </label>
          <label className="pending-search-field pending-search-field-sm">
            Año
            <input type="text" name="year" defaultValue={year} placeholder="2022" />
          </label>
        </div>
        <input type="hidden" name="genre" value={genre} />
        <input type="hidden" name="sort" value={activeSort} />
        <div className="pending-toolbar-actions">
          <button type="submit" className="primary-button">
            Aplicar
          </button>
          <Link href="/vistas" className="ghost-button">
            Limpiar filtros
          </Link>
        </div>
      </form>

      <div className="history-toolbar-layers">
        {genres.length > 0 ? (
          <div className="chips filter-chips">
            <Link
              href={buildSeenQuery({ search, year, sort: activeSort })}
              className={`filter-chip ${!genre ? "filter-chip-active" : ""}`}
            >
              Todos
            </Link>
            {genres.map((item) => (
              <Link
                key={item}
                href={buildSeenQuery({ search, year, genre: item, sort: activeSort })}
                className={`filter-chip ${genre === item ? "filter-chip-active" : ""}`}
              >
                {item}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="sort-pills sort-pills-panel" aria-label="Ordenar vistas">
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={buildSeenQuery({ search, year, genre, sort: option.value })}
              className={`sort-pill ${activeSort === option.value ? "sort-pill-active" : ""}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="pending-summary-row">
        <p className="status-text">
          {history.length === allHistory.length
            ? `${allHistory.length} películas vistas en total.`
            : `${history.length} resultados de ${allHistory.length} películas vistas.`}
        </p>
        {history.length > PAGE_SIZE ? (
          <p className="muted-copy">
            Página {safePage} de {totalPages}
          </p>
        ) : null}
      </div>

      {history.length === 0 ? (
        <div className="empty-state">
          <p className="body-copy">No hay películas vistas que encajen con esos filtros.</p>
          <div className="inline-actions">
            <Link href="/vistas" className="ghost-button">
              Ver todas
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className={`history-grid-compact history-grid-standardized ${pagedHistory.length <= 2 ? "history-grid-tight" : ""}`}>
            {pagedHistory.map((item) => {
              const visibleGenres = item.movie.genres.length > 0 ? item.movie.genres.slice(0, 3) : ["Sin género"];

              return (
                <Link key={item.movie.id} href={`/peliculas/${item.movie.slug}`} className="history-card-link">
                  <article className="history-card-compact history-card-viewed">
                    <div
                      className="history-poster-compact"
                      style={
                        item.movie.posterUrl
                          ? {
                              backgroundImage: `linear-gradient(180deg, rgba(10, 15, 24, 0.08), rgba(10, 15, 24, 0.55)), url(${item.movie.posterUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center"
                            }
                          : undefined
                      }
                    />
                    <div className="history-card-copy history-card-copy-spacious history-card-viewed-copy">
                      <p className="eyebrow">{item.watchedOn ? `Vista ${formatShortDate(item.watchedOn)}` : "Sin fecha"}</p>
                      <strong className="history-card-title">{item.movie.title}</strong>
                      <p className="history-card-subline">{item.movie.year > 0 ? item.movie.year : "Año pendiente"}</p>
                      <div className="chips pending-card-genres history-card-genres">
                        {visibleGenres.map((itemGenre) => (
                          <span key={`${item.movie.id}-${itemGenre}`}>{itemGenre}</span>
                        ))}
                      </div>
                      <div className="history-card-score-grid">
                        <div className="history-card-score-pill">
                          <small>Grupo</small>
                          <strong>{formatScore(item.groupAverage)}</strong>
                        </div>
                        <div className="history-card-score-pill history-card-score-pill-user">
                          <small>Tu nota</small>
                          <strong>{typeof item.userRating === "number" ? formatScore(item.userRating) : "-"}</strong>
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <nav className="pagination-bar" aria-label="Paginación de vistas">
              <Link
                href={buildSeenQuery({ search, year, genre, sort: activeSort, page: Math.max(1, safePage - 1) })}
                className={`pagination-side ${safePage === 1 ? "is-disabled" : ""}`}
                aria-disabled={safePage === 1}
              >
                Anterior
              </Link>
              <div className="pagination-pages">
                {paginationItems.map((item, index) =>
                  item === "ellipsis" ? (
                    <span key={`ellipsis-${index}`} className="pagination-ellipsis" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <Link
                      key={item}
                      href={buildSeenQuery({ search, year, genre, sort: activeSort, page: item })}
                      className={`pagination-page ${item === safePage ? "pagination-page-active" : ""}`}
                      aria-current={item === safePage ? "page" : undefined}
                    >
                      {item}
                    </Link>
                  )
                )}
              </div>
              <Link
                href={buildSeenQuery({ search, year, genre, sort: activeSort, page: Math.min(totalPages, safePage + 1) })}
                className={`pagination-side ${safePage === totalPages ? "is-disabled" : ""}`}
                aria-disabled={safePage === totalPages}
              >
                Siguiente
              </Link>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
