import Link from "next/link";

import { getCurrentBatch, listPendingHydrated } from "@/lib/store";

export default async function PendingPage() {
  const pending = await listPendingHydrated();
  const batch = await getCurrentBatch();

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Pendientes</p>
        <h1>Películas pendientes de ver</h1>
        <p className="body-copy">
          Aquí guardáis las pelis que queréis tener a mano antes de que entren en la selección semanal.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="empty-state">
          <p className="body-copy">Todavía no habéis añadido ninguna película a pendientes.</p>
          <Link href="/explorar" className="secondary-button">
            Ir a explorar
          </Link>
        </div>
      ) : (
        <div className="history-grid-compact">
          {pending.map((movie) => (
            <article key={movie.id} className="history-card-compact">
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
                <div className="recommendation-actions">
                  <Link href={`/peliculas/${movie.slug}`} className="secondary-button">
                    Ver ficha
                  </Link>
                  <form action="/api/pending/remove" method="post">
                    <input type="hidden" name="movieId" value={movie.id} />
                    <input type="hidden" name="redirectTo" value="/pendientes" />
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
      )}
    </section>
  );
}
