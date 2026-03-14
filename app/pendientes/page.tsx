import Link from "next/link";

import { getCurrentBatch, listPendingHydrated } from "@/lib/store";

const PAGE_SIZE = 12;

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

export default async function PendingPage({ searchParams }: PendingPageProps) {
  const params = searchParams ? await searchParams : {};
  const search = getSingleParam(params.search).trim();
  const activeGenre = getSingleParam(params.genre).trim();
  const pageFromQuery = Number.parseInt(getSingleParam(params.page), 10);
  const currentPage = Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;

  const [pending, batch] = await Promise.all([listPendingHydrated(), getCurrentBatch()]);
  const genres = Array.from(
    new Set(
      pending
        .flatMap((movie) => movie.genres)
        .map((genre) => genre.trim())
        .filter((genre) => genre && genre.toLowerCase() !== "pendiente")
    )
  ).sort((left, right) => left.localeCompare(right, "es"));

  const filteredPending = pending.filter((movie) => {
    const matchesSearch =
      !search ||
      `${movie.title} ${movie.year} ${movie.director} ${movie.cast.join(" ")}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es"));

    const matchesGenre = !activeGenre || movie.genres.some((genre) => genre.toLocaleLowerCase("es") === activeGenre.toLocaleLowerCase("es"));

    return matchesSearch && matchesGenre;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPending.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedPending = filteredPending.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Pendientes</p>
        <h1>Películas pendientes de ver</h1>
        <p className="body-copy">
          Aquí guardáis las pelis que queréis tener a mano antes de que entren en la selección semanal.
        </p>
      </div>

      <form action="/pendientes" method="get" className="pending-toolbar">
        <label className="pending-search-field">
          Buscar una peli concreta
          <input type="search" name="search" defaultValue={search} placeholder="Interstellar, Toy Story, Whiplash..." />
        </label>
        <input type="hidden" name="genre" value={activeGenre} />
        <div className="pending-toolbar-actions">
          <button type="submit" className="primary-button">
            Aplicar
          </button>
          <Link href="/pendientes" className="ghost-button">
            Limpiar filtros
          </Link>
        </div>
      </form>

      {genres.length > 0 ? (
        <div className="chips filter-chips">
          <Link href={buildPendingQuery({ search })} className={`filter-chip ${!activeGenre ? "filter-chip-active" : ""}`}>
            Todos
          </Link>
          {genres.map((genre) => (
            <Link
              key={genre}
              href={buildPendingQuery({ search, genre })}
              className={`filter-chip ${activeGenre === genre ? "filter-chip-active" : ""}`}
            >
              {genre}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="pending-summary-row">
        <p className="status-text">
          {filteredPending.length === pending.length
            ? `${pending.length} pendientes en lista.`
            : `${filteredPending.length} resultados de ${pending.length} pendientes.`}
        </p>
        {filteredPending.length > PAGE_SIZE ? (
          <p className="muted-copy">
            Página {safePage} de {totalPages}
          </p>
        ) : null}
      </div>

      {filteredPending.length === 0 ? (
        <div className="empty-state">
          <p className="body-copy">
            {pending.length === 0
              ? "Todavía no habéis añadido ninguna película a pendientes."
              : "No hay ninguna pendiente que encaje con esos filtros."}
          </p>
          <div className="inline-actions">
            <Link href="/explorar" className="secondary-button">
              Ir a explorar
            </Link>
            {pending.length > 0 ? (
              <Link href="/pendientes" className="ghost-button">
                Ver todas
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="history-grid-compact">
            {pagedPending.map((movie) => (
              <article key={movie.id} className="history-card-compact history-card-pending">
                <Link href={`/peliculas/${movie.slug}`} className="history-card-link">
                  <div
                    className="history-poster-compact"
                    style={
                      movie.posterUrl
                        ? {
                            backgroundImage: `linear-gradient(180deg, rgba(10, 15, 24, 0.08), rgba(10, 15, 24, 0.55)), url(${movie.posterUrl})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center"
                          }
                        : undefined
                    }
                  />
                </Link>
                <div className="history-card-copy">
                  <strong>{movie.title}</strong>
                  <div className="stat-row">
                    <span>{movie.year > 0 ? movie.year : "Año pendiente"}</span>
                    <span>
                      {movie.externalRating.source}: {movie.externalRating.value}
                    </span>
                  </div>
                  <div className="chips pending-card-genres">
                    {movie.genres.slice(0, 3).map((genre) => (
                      <span key={`${movie.id}-${genre}`}>{genre}</span>
                    ))}
                  </div>
                  <div className="recommendation-actions">
                    <Link href={`/peliculas/${movie.slug}`} className="secondary-button">
                      Ver ficha
                    </Link>
                    <form action="/api/pending/remove" method="post">
                      <input type="hidden" name="movieId" value={movie.id} />
                      <input type="hidden" name="redirectTo" value={buildPendingQuery({ search, genre: activeGenre, page: safePage })} />
                      <button type="submit" className="ghost-button">
                        Quitar de pendientes
                      </button>
                    </form>
                    {batch ? (
                      <form action="/api/weekly-recommendations/select" method="post">
                        <input type="hidden" name="batchId" value={batch.id} />
                        <input type="hidden" name="movieId" value={movie.id} />
                        <button type="submit" className="primary-button">
                          Elegir para esta semana
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="pending-pagination">
              <Link
                href={buildPendingQuery({ search, genre: activeGenre, page: Math.max(1, safePage - 1) })}
                className={`secondary-button ${safePage === 1 ? "is-disabled" : ""}`}
                aria-disabled={safePage === 1}
              >
                Página anterior
              </Link>
              <div className="pending-pagination-pages">
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <Link
                    key={page}
                    href={buildPendingQuery({ search, genre: activeGenre, page })}
                    className={`filter-chip ${page === safePage ? "filter-chip-active" : ""}`}
                  >
                    {page}
                  </Link>
                ))}
              </div>
              <Link
                href={buildPendingQuery({ search, genre: activeGenre, page: Math.min(totalPages, safePage + 1) })}
                className={`secondary-button ${safePage === totalPages ? "is-disabled" : ""}`}
                aria-disabled={safePage === totalPages}
              >
                Página siguiente
              </Link>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
