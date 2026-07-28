import { Suspense } from "react";
import Link from "next/link";

import { UpcomingReleasesPanel, UpcomingReleasesPanelFallback } from "@/components/upcoming-releases-panel";
import { getDashboardOverviewHydrated } from "@/lib/store";
import { formatScore } from "@/lib/utils";

export default async function HomePage() {
  const dashboard = await getDashboardOverviewHydrated();
  const selectedMovie = dashboard.selectedMovie;
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
                  <span className="dashboard-viewed-status">Vista por el grupo</span>
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
      </section>
    </div>
  );
}
