import type { CSSProperties } from "react";

import { DirectionalChapterAssist } from "@/components/directional-chapter-assist";
import { FilterDropdown } from "@/components/filter-dropdown";
import { PrefetchLink } from "@/components/prefetch-link";
import { PosterImage } from "@/components/poster-image";
import { getSessionUser, getViewedPageDataHydrated } from "@/lib/store";
import { buildPaginationItems, formatCount, formatScore, formatShortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 16;

type SeenPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const SORT_OPTIONS = [
  { value: "watched-desc", label: "Última registrada primero" },
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

  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.year?.trim()) query.set("year", params.year.trim());
  if (params.genre?.trim()) query.set("genre", params.genre.trim());
  if (params.sort?.trim() && params.sort !== "watched-desc") query.set("sort", params.sort.trim());
  if (params.page && params.page > 1) query.set("page", String(params.page));

  const serialized = query.toString();
  return serialized ? `/vistas?${serialized}` : "/vistas";
}

function buildSeenPageHref(params: Parameters<typeof buildSeenQuery>[0]) {
  return `${buildSeenQuery(params)}#archivo-vistas`;
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
  const {
    genres,
    totalHistoryCount,
    filteredHistoryCount,
    totalPages,
    currentPage: safePage,
    recentHistory,
    pagedHistory
  } = await getViewedPageDataHydrated({
    search,
    year,
    genre,
    sort: activeSort,
    currentUserId: sessionUser?.id,
    page: currentPage,
    pageSize: PAGE_SIZE
  });

  const paginationItems = buildPaginationItems(safePage, totalPages);
  const hasActiveFilters = Boolean(search || year || genre || activeSort !== "watched-desc");
  const latest = recentHistory[0];
  const heroStyle = latest?.movie.backdrop
    ? ({ "--seen-hero-image": `url("${latest.movie.backdrop}")` } as CSSProperties)
    : undefined;

  return (
    <section className="seen-page">
      <DirectionalChapterAssist />

      <header id="vistas-portada" className="cinema-page-intro seen-page-intro" data-scroll-chapter style={heroStyle}>
        <div className="seen-page-intro-copy">
          <p className="cinema-kicker">Archivo del grupo</p>
          <h1>Vistas</h1>
          {latest ? (
            <div className="seen-page-intro-latest">
              <span>Última sesión</span>
              <PrefetchLink href={`/peliculas/${latest.movie.slug}`}>
                {latest.movie.title} <span aria-hidden="true">↗</span>
              </PrefetchLink>
            </div>
          ) : null}
        </div>

        <div className="seen-page-intro-ledger">
          <span>En total</span>
          <strong>{String(totalHistoryCount).padStart(2, "0")}</strong>
          <a href={recentHistory.length > 0 ? "#ultimas-vistas" : "#archivo-vistas"}>
            Recorrer archivo <span aria-hidden="true">↓</span>
          </a>
        </div>
      </header>

      {recentHistory.length > 0 ? (
        <section id="ultimas-vistas" className="seen-recent-panel" data-scroll-chapter aria-label="Últimas películas vistas">
          <div className="seen-section-heading">
            <p className="cinema-kicker">Últimas sesiones</p>
            <h2>Recién vistas</h2>
          </div>

          <div className={`seen-recent-grid ${recentHistory.length < 3 ? "seen-recent-grid-tight" : ""}`}>
            {recentHistory.map((item, index) => {
              const primaryGenre = item.movie.genres.find((entry) => entry !== "Pendiente");
              return (
                <PrefetchLink
                  key={item.movie.id}
                  href={`/peliculas/${item.movie.slug}`}
                  className={`seen-recent-card ${index === 0 ? "is-lead" : ""}`}
                >
                  <div className="seen-recent-image">
                    <PosterImage src={index === 0 ? item.movie.backdrop ?? item.movie.posterUrl : item.movie.posterUrl} />
                    <span className="seen-recent-number">{String(index + 1).padStart(2, "0")}</span>
                    <div className="seen-recent-overlay">
                      <p>{item.watchedOn ? formatShortDate(item.watchedOn) : "Fecha pendiente"}</p>
                      <h3>{item.movie.title}</h3>
                      <div className="seen-recent-meta">
                        {item.movie.year > 0 ? <span>{item.movie.year}</span> : null}
                        {primaryGenre ? <span>{primaryGenre}</span> : null}
                        <span>Grupo {formatScore(item.groupAverage)}</span>
                      </div>
                    </div>
                  </div>
                </PrefetchLink>
              );
            })}
          </div>
        </section>
      ) : null}

      <section id="archivo-vistas" className="seen-archive-panel" data-scroll-chapter aria-label="Archivo de vistas">
        <div className="seen-section-heading seen-archive-heading">
          <p className="cinema-kicker">Archivo completo</p>
          <h2>Todas las películas</h2>
        </div>

        {totalHistoryCount > 0 || hasActiveFilters ? (
          <form action="/vistas#archivo-vistas" method="get" className="seen-toolbar">
            <div className="seen-filter-grid">
              <label className="seen-field seen-field-wide">
                Buscar por título
                <input type="search" name="search" defaultValue={search} placeholder="Pulp Fiction, Soul, Interstellar..." />
              </label>
              <label className="seen-field">
                Año
                <input type="text" name="year" defaultValue={year} placeholder="2022" inputMode="numeric" />
              </label>
              <label className="seen-field">
                Género
                <FilterDropdown
                  name="genre"
                  value={genre}
                  placeholder="Todos los géneros"
                  ariaLabel="Filtrar vistas por género"
                  options={[{ value: "", label: "Todos los géneros" }, ...genres.map((item) => ({ value: item, label: item }))]}
                />
              </label>
              <label className="seen-field">
                Orden
                <FilterDropdown
                  name="sort"
                  value={activeSort}
                  placeholder="Ordenar"
                  ariaLabel="Ordenar películas vistas"
                  options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                />
              </label>
            </div>

            <div className="seen-toolbar-actions">
              <button type="submit" className="primary-button">Aplicar filtros</button>
              <PrefetchLink href="/vistas#archivo-vistas" className="ghost-button">Limpiar</PrefetchLink>
            </div>
          </form>
        ) : null}

        <div className="seen-list-anchor">
          <div className="seen-results-strip">
            <p className="status-text">
              {filteredHistoryCount === totalHistoryCount
                ? `${formatCount(totalHistoryCount, "película vista", "películas vistas")} en total.`
                : `${formatCount(filteredHistoryCount, "resultado")} de ${formatCount(totalHistoryCount, "película vista", "películas vistas")}.`}
            </p>
            {filteredHistoryCount > PAGE_SIZE ? <p className="muted-copy">Página {safePage} de {totalPages}</p> : null}
          </div>

          {filteredHistoryCount === 0 ? (
            <div className="seen-empty-state">
              <p className="eyebrow">Sin resultados</p>
              <h2>No hay películas vistas que encajen con esos filtros.</h2>
              <p className="body-copy">Prueba a quitar el año, el género o parte del título.</p>
              <div className="inline-actions">
                <PrefetchLink href="/vistas#archivo-vistas" className="ghost-button">Ver todas</PrefetchLink>
              </div>
            </div>
          ) : (
            <>
              <div className={`seen-grid ${pagedHistory.length <= 2 ? "seen-grid-tight" : ""}`}>
                {pagedHistory.map((item, index) => {
                  const archiveNumber = (safePage - 1) * PAGE_SIZE + index + 1;
                  return (
                    <PrefetchLink key={item.movie.id} href={`/peliculas/${item.movie.slug}`} className="seen-card-link">
                      <article className="seen-card">
                        <div className="seen-card-poster">
                          <PosterImage src={item.movie.posterUrl} />
                          <span className="seen-archive-number">{String(archiveNumber).padStart(2, "0")}</span>
                          <span className="seen-watched-date">
                            {item.watchedOn ? formatShortDate(item.watchedOn) : "Fecha pendiente"}
                          </span>
                        </div>

                        <div className="seen-card-copy">
                          <div>
                            <strong className="seen-card-title">{item.movie.title}</strong>
                            <p className="seen-card-subline">{item.movie.year > 0 ? item.movie.year : "Año pendiente"}</p>
                          </div>
                          <div className="seen-card-score-grid">
                            <div className="seen-card-score-pill">
                              <small>Grupo</small>
                              <strong>{formatScore(item.groupAverage)}</strong>
                            </div>
                            <div className="seen-card-score-pill seen-card-score-pill-user">
                              <small>Tu nota</small>
                              <strong>{typeof item.userRating === "number" ? formatScore(item.userRating) : "—"}</strong>
                            </div>
                          </div>
                        </div>
                      </article>
                    </PrefetchLink>
                  );
                })}
              </div>

              {totalPages > 1 ? (
                <nav className="pagination-bar seen-pagination" aria-label="Paginación de vistas">
                  <PrefetchLink
                    href={buildSeenPageHref({ search, year, genre, sort: activeSort, page: Math.max(1, safePage - 1) })}
                    className={`pagination-side ${safePage === 1 ? "is-disabled" : ""}`}
                    aria-disabled={safePage === 1}
                  >Anterior</PrefetchLink>
                  <div className="pagination-pages">
                    {paginationItems.map((item, index) =>
                      item === "ellipsis" ? (
                        <span key={`ellipsis-${index}`} className="pagination-ellipsis" aria-hidden="true">…</span>
                      ) : (
                        <PrefetchLink
                          key={item}
                          href={buildSeenPageHref({ search, year, genre, sort: activeSort, page: item })}
                          className={`pagination-page ${item === safePage ? "pagination-page-active" : ""}`}
                          aria-current={item === safePage ? "page" : undefined}
                        >{item}</PrefetchLink>
                      )
                    )}
                  </div>
                  <PrefetchLink
                    href={buildSeenPageHref({ search, year, genre, sort: activeSort, page: Math.min(totalPages, safePage + 1) })}
                    className={`pagination-side ${safePage === totalPages ? "is-disabled" : ""}`}
                    aria-disabled={safePage === totalPages}
                  >Siguiente</PrefetchLink>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </section>
    </section>
  );
}
