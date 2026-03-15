import Link from "next/link";

import { getSessionUser, listHistoryHydrated } from "@/lib/store";
import { formatScore } from "@/lib/utils";

type SeenPageProps = {
  searchParams?: Promise<{
    genre?: string;
    year?: string;
    search?: string;
    sort?: "watched-desc" | "group-desc" | "group-asc" | "mine-desc" | "mine-asc";
  }>;
};

const SORT_OPTIONS = [
  { value: "watched-desc", label: "Ultima vista primero" },
  { value: "group-desc", label: "Grupo: mayor a menor" },
  { value: "group-asc", label: "Grupo: menor a mayor" },
  { value: "mine-desc", label: "Mi nota: mayor a menor" },
  { value: "mine-asc", label: "Mi nota: menor a mayor" }
] as const;

function buildSortHref(filters: Awaited<SeenPageProps["searchParams"]>, sort: string) {
  const params = new URLSearchParams();
  if (filters?.search) {
    params.set("search", filters.search);
  }
  if (filters?.year) {
    params.set("year", filters.year);
  }
  params.set("sort", sort);
  return `/vistas?${params.toString()}`;
}

export default async function SeenPage({ searchParams }: SeenPageProps) {
  const filters = (await searchParams) ?? {};
  const sessionUser = await getSessionUser();
  const activeSort = filters.sort ?? "watched-desc";
  const history = await listHistoryHydrated(
    {
      ...filters,
      sort: activeSort
    },
    sessionUser?.id
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Vistas del grupo</p>
        <h1>Películas vistas y notas</h1>
        <p className="body-copy">Un resumen rápido de lo que ya habéis visto. Si quieres más detalle, entra en la ficha.</p>
      </div>

      <form className="filter-row history-filter-row" method="get">
        <input type="search" name="search" defaultValue={filters.search} placeholder="Buscar por título" />
        <input type="text" name="year" defaultValue={filters.year} placeholder="Año" />
        <input type="hidden" name="sort" value={activeSort} />
        <button type="submit" className="secondary-button">
          Filtrar
        </button>
      </form>

      <div className="sort-pills" aria-label="Ordenar vistas">
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={buildSortHref(filters, option.value)}
            className={`sort-pill ${activeSort === option.value ? "sort-pill-active" : ""}`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="history-grid-compact">
        {history.map((item) => (
          <Link key={item.movie.id} href={`/peliculas/${item.movie.slug}`} className="history-card-link">
            <article className="history-card-compact">
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
              <div className="history-card-copy">
                <strong>{item.movie.title}</strong>
                <div className="stat-row">
                  <span>{item.movie.year > 0 ? item.movie.year : "Año pendiente"}</span>
                  <span>Grupo: {formatScore(item.groupAverage)}</span>
                </div>
                {typeof item.userRating === "number" ? <span className="muted-copy">Tu nota: {formatScore(item.userRating)}</span> : null}
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
