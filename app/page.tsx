import { Suspense } from "react";
import Link from "next/link";

import { UpcomingReleasesPanel, UpcomingReleasesPanelFallback } from "@/components/upcoming-releases-panel";
import { getDashboardOverviewHydrated } from "@/lib/store";
import { formatScore, formatShortDate } from "@/lib/utils";

export default async function HomePage() {
  const dashboard = await getDashboardOverviewHydrated();
  const selectedMovie = dashboard.selectedMovie;
  const latestActivity = dashboard.recentActivity[0] ?? null;
  const spotlightGenres = selectedMovie?.genres.slice(0, 2).join(" / ");
  const spotlightArtwork = selectedMovie?.backdrop || selectedMovie?.posterUrl;
  const hasWatchedSelection = Boolean(dashboard.selectedWatchEntry);
  const heroSubtitle = selectedMovie
    ? selectedMovie.director
    : "Elegid una candidata y la portada se convertira en programa de la semana.";

  return (
    <div className="dashboard-pilot">
      <section className="dashboard-command" aria-labelledby="dashboard-title">
        {spotlightArtwork ? (
          <div
            className="dashboard-command-art"
            style={{
              backgroundImage: `linear-gradient(90deg, rgba(10, 14, 22, 0.95) 0%, rgba(10, 14, 22, 0.8) 42%, rgba(10, 14, 22, 0.2) 100%), url(${spotlightArtwork})`
            }}
          />
        ) : null}

        <div className="dashboard-command-label">
          <p className="eyebrow">Peli de la semana</p>
        </div>

        <div className="dashboard-command-copy">
          <h1 id="dashboard-title">{selectedMovie ? selectedMovie.title : "Cartelera por decidir"}</h1>
          <p className="dashboard-command-director">{heroSubtitle}</p>

          {selectedMovie ? (
            <div className="dashboard-command-meta" aria-label="Datos de la pelicula seleccionada">
              <span>{selectedMovie.year > 0 ? selectedMovie.year : "Año pendiente"}</span>
              <span>{spotlightGenres || "Género pendiente"}</span>
              <span>
                {selectedMovie.externalRating.source} {selectedMovie.externalRating.value}
              </span>
            </div>
          ) : null}

          <div className="dashboard-command-actions">
            {selectedMovie ? (
              <>
                <Link href={`/peliculas/${selectedMovie.slug}`} className="primary-button">
                  Abrir ficha
                </Link>
                {hasWatchedSelection ? (
                  <span className="secondary-button">Ya está en vistas</span>
                ) : (
                  <form action="/api/watch/mark-watched" method="post">
                    <input type="hidden" name="movieId" value={selectedMovie.id} />
                    <input type="hidden" name="redirectTo" value="/" />
                    <button type="submit" className="secondary-button">
                      Marcar como vista
                    </button>
                  </form>
                )}
              </>
            ) : (
              <Link href="/pendientes" className="primary-button">
                Elegir desde pendientes
              </Link>
            )}
          </div>
        </div>

        <div className="dashboard-command-ledger" aria-label="Resumen del grupo">
          <article>
            <span>Archivo</span>
            <strong>{dashboard.stats.watchedCount}</strong>
            <small>vistas</small>
          </article>
          <article>
            <span>Media</span>
            <strong>{formatScore(dashboard.stats.averageScore)}</strong>
            <small>grupo</small>
          </article>
          <article>
            <span>Lista</span>
            <strong>{dashboard.stats.pendingCount}</strong>
            <small>pendientes</small>
          </article>
        </div>
      </section>

      <section className="dashboard-bottom-grid">
        <Suspense fallback={<UpcomingReleasesPanelFallback />}>
          <UpcomingReleasesPanel />
        </Suspense>

        <details className="dashboard-live-rail dashboard-history-drawer">
          <summary className="dashboard-history-summary">
            <span>
              <span className="eyebrow">Historial</span>
              <strong>Últimos movimientos</strong>
            </span>
            <span className="dashboard-history-toggle" aria-hidden="true">
              Ver
            </span>
          </summary>

          <div className="dashboard-history-content">
            <div className="dashboard-history-actions">
              <Link href="/grupo" className="dashboard-rail-link">
                Ver grupo
              </Link>
            </div>

            <div className="dashboard-last-move">
              <span>Movimiento reciente</span>
              <strong>{latestActivity ? latestActivity.label : "Todavía no hay actividad reciente"}</strong>
              <p>
                {latestActivity
                  ? `Registrado el ${formatShortDate(latestActivity.date)}.`
                  : "Cuando puntuéis o mováis pelis, aparecerá aquí."}
              </p>
            </div>

            <div className="dashboard-live-list">
              {dashboard.recentActivity.length > 0 ? (
                dashboard.recentActivity.slice(0, 4).map((item, index) => (
                  <article key={`${item.date}-${item.label}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{formatShortDate(item.date)}</small>
                    </div>
                  </article>
                ))
              ) : (
                <article className="dashboard-live-empty">
                  <div>
                    <strong>Sin movimientos todavía.</strong>
                    <small>La bitácora se llenará sola con vuestras acciones.</small>
                  </div>
                </article>
              )}
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
