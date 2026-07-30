import { Suspense } from "react";
import Link from "next/link";

import { CinematicStage } from "@/components/cinematic-stage";
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
    <div className="cinema-home">
      <CinematicStage className="cinema-opening" labelledBy="dashboard-title">
        {spotlightArtwork ? (
          <div
            className="cinema-opening-art"
            style={{
              backgroundImage: `url(${spotlightArtwork})`
            }}
          />
        ) : null}

        <div className="cinema-opening-shade" />
        <div className="cinema-opening-grain" aria-hidden="true" />

        <div className="cinema-opening-index" aria-hidden="true">
          <span>01</span>
          <i />
          <span>Sesión semanal</span>
        </div>

        <div className="cinema-opening-copy">
          <p className="cinema-kicker">Ahora en el centro de la conversación</p>
          <h1 id="dashboard-title">{selectedMovie ? selectedMovie.title : "Cartelera por decidir"}</h1>
          <p className="cinema-opening-director">{heroSubtitle}</p>

          {selectedMovie ? (
            <div className="cinema-opening-meta" aria-label="Datos de la película seleccionada">
              <span>{selectedMovie.year > 0 ? selectedMovie.year : "Año pendiente"}</span>
              <span>{spotlightGenres || "Género pendiente"}</span>
              <span>
                {selectedMovie.externalRating.source} {selectedMovie.externalRating.value}
              </span>
            </div>
          ) : null}

          <div className="cinema-opening-actions">
            {selectedMovie ? (
              <>
                <Link href={`/peliculas/${selectedMovie.slug}`} className="cinema-primary-action">
                  <span>Abrir ficha</span>
                  <span aria-hidden="true">↗</span>
                </Link>
                {hasWatchedSelection ? (
                  <span className="cinema-viewed-status">Vista por el grupo</span>
                ) : (
                  <form action="/api/watch/mark-watched" method="post">
                    <input type="hidden" name="movieId" value={selectedMovie.id} />
                    <input type="hidden" name="redirectTo" value="/" />
                    <button type="submit" className="cinema-secondary-action">
                      Marcar como vista
                    </button>
                  </form>
                )}
              </>
            ) : (
              <Link href="/pendientes" className="cinema-primary-action">
                Elegir desde pendientes
              </Link>
            )}
          </div>
        </div>

        <div className="cinema-opening-ledger" aria-label="Resumen del grupo">
          <article>
            <span>Películas vistas</span>
            <strong>{dashboard.stats.watchedCount}</strong>
            <small>en el archivo</small>
          </article>
          <article>
            <span>Nota del grupo</span>
            <strong>{formatScore(dashboard.stats.averageScore)}</strong>
            <small>media histórica</small>
          </article>
          <article>
            <span>Por descubrir</span>
            <strong>{dashboard.stats.pendingCount}</strong>
            <small>en pendientes</small>
          </article>
        </div>

        <div className="cinema-scroll-cue" aria-hidden="true">
          <span>Continúa</span>
          <i />
        </div>
      </CinematicStage>

      <section className="cinema-home-program">
        <Suspense fallback={<UpcomingReleasesPanelFallback />}>
          <UpcomingReleasesPanel />
        </Suspense>
      </section>
    </div>
  );
}
