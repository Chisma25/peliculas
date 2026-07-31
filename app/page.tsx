import { Suspense } from "react";
import Link from "next/link";

import { CinematicStage } from "@/components/cinematic-stage";
import { DirectionalChapterAssist } from "@/components/directional-chapter-assist";
import { NowPlayingPanel, NowPlayingPanelFallback } from "@/components/now-playing-panel";
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
    : "Todavía no habéis elegido película.";

  return (
    <div className="cinema-home">
      <DirectionalChapterAssist />
      <div id="semana" className="cinema-home-snap-start" data-scroll-chapter aria-hidden="true" />
      <CinematicStage
        className={`cinema-opening ${selectedMovie ? "cinema-opening-selected" : "cinema-opening-empty"}`}
        labelledBy="dashboard-title"
      >
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
        {!selectedMovie ? (
          <div className="cinema-opening-empty-art" aria-hidden="true">
            <span>Por</span>
            <span>elegir</span>
            <i />
          </div>
        ) : null}

        <div className="cinema-opening-index" aria-hidden="true">
          <span>01</span>
          <i />
          <span>Sesión semanal</span>
        </div>

        <div className="cinema-opening-copy">
          <p className="cinema-kicker">Película de la semana</p>
          <h1 id="dashboard-title">{selectedMovie ? selectedMovie.title : "Esta semana"}</h1>
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
            <small>en total</small>
          </article>
          <article>
            <span>Nota del grupo</span>
            <strong>{formatScore(dashboard.stats.averageScore)}</strong>
            <small>media histórica</small>
          </article>
          <article>
            <span>Pendientes</span>
            <strong>{dashboard.stats.pendingCount}</strong>
            <small>por ver</small>
          </article>
        </div>

        <nav className="cinema-chapter-nav" aria-label="Navegación entre capítulos">
          <a href="#cartelera" aria-label="Bajar a películas en cartelera" title="Ir a Cartelera">
            <span aria-hidden="true">↓</span>
          </a>
        </nav>
      </CinematicStage>

      <section id="cartelera" className="cinema-home-program cinema-home-now-playing" data-scroll-chapter aria-label="Ahora en cines">
        <Suspense fallback={<NowPlayingPanelFallback />}>
          <NowPlayingPanel />
        </Suspense>
        <nav className="cinema-chapter-nav" aria-label="Navegación entre capítulos">
          <a href="#semana" aria-label="Subir a la película de la semana" title="Volver a la película semanal">
            <span aria-hidden="true">↑</span>
          </a>
          <a href="#proximamente" aria-label="Bajar a próximos estrenos" title="Ir a Próximamente">
            <span aria-hidden="true">↓</span>
          </a>
        </nav>
      </section>

      <section id="proximamente" className="cinema-home-program cinema-home-upcoming" data-scroll-chapter aria-label="Próximos estrenos">
        <Suspense fallback={<UpcomingReleasesPanelFallback />}>
          <UpcomingReleasesPanel />
        </Suspense>
        <nav className="cinema-chapter-nav" aria-label="Navegación entre capítulos">
          <a href="#cartelera" aria-label="Subir a películas en cartelera" title="Volver a Cartelera">
            <span aria-hidden="true">↑</span>
          </a>
        </nav>
      </section>
    </div>
  );
}
