import { MoviePoster } from "@/components/movie-poster";
import { getUpcomingDashboardReleasesHydrated } from "@/lib/store";
import { formatFitScore, formatShortDate } from "@/lib/utils";

function getTmdbMovieUrl(tmdbId?: string) {
  return tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : undefined;
}

export async function UpcomingReleasesPanel() {
  const upcomingReleases = await getUpcomingDashboardReleasesHydrated();

  return (
    <section className="panel dashboard-panel-main upcoming-panel">
      <div className="panel-header">
        <p className="eyebrow">Próximos estrenos</p>
        <h2>Tres lanzamientos que os pueden interesar</h2>
        <p className="body-copy">
          Una selección de estrenos dentro del próximo mes que encajan con vuestro radar de grupo para tenerlos presentes si salen en
          digital o si merece la pena ir al cine.
        </p>
      </div>

      {upcomingReleases.length > 0 ? (
        <div className="upcoming-release-grid">
          {upcomingReleases.map((item) => {
            const tmdbUrl = getTmdbMovieUrl(item.movie.sourceIds?.tmdb);

            return (
              <article key={item.movie.id} className="upcoming-release-card">
                <div className="upcoming-release-poster">
                  <MoviePoster
                    movie={item.movie}
                    compact
                    showDetails={false}
                    metaLabel={item.movie.genres.slice(0, 1).join(" / ") || "Estreno"}
                  />
                </div>

                <div className="upcoming-release-copy">
                  <div className="recommendation-topline">
                    <p className="eyebrow">Estreno cercano</p>
                    <span className="recommendation-fit-badge recommendation-fit-badge-compact">
                      {formatFitScore(item.score)}/100
                    </span>
                  </div>

                  <div className="upcoming-release-title-stack">
                    <h3>{item.movie.title}</h3>
                    <p className="upcoming-release-director">{item.movie.director}</p>
                  </div>

                  <div className="upcoming-release-meta">
                    <span>Estreno {formatShortDate(item.releaseDate)}</span>
                    <span>{item.movie.genres.slice(0, 2).join(" / ") || "Próximo estreno"}</span>
                  </div>

                  <div className="recommendation-metrics recommendation-metrics-compact">
                    {item.metrics.map((metric) => (
                      <div
                        key={`${item.movie.id}-${metric.label}`}
                        className={`recommendation-metric recommendation-metric-${metric.tone ?? "neutral"}`}
                      >
                        <small>{metric.label}</small>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="upcoming-release-actions">
                    {tmdbUrl ? (
                      <a href={tmdbUrl} target="_blank" rel="noreferrer" className="secondary-button">
                        Abrir en TMDb
                      </a>
                    ) : (
                      <span className="secondary-button secondary-button-placeholder">Sin enlace</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <p className="body-copy">No hemos encontrado estrenos relevantes para el próximo mes.</p>
        </div>
      )}
    </section>
  );
}

export function UpcomingReleasesPanelFallback() {
  return (
    <section className="panel dashboard-panel-main upcoming-panel">
      <div className="panel-header">
        <p className="eyebrow">Próximos estrenos</p>
        <h2>Tres lanzamientos que os pueden interesar</h2>
        <p className="body-copy">Cargando radar de estrenos para el próximo mes…</p>
      </div>

      <div className="upcoming-release-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <article key={index} className="upcoming-release-card upcoming-release-card-skeleton" aria-hidden="true">
            <div className="upcoming-release-poster">
              <div className="upcoming-release-poster-skeleton shimmer-block" />
            </div>
            <div className="upcoming-release-copy">
              <div className="shimmer-line shimmer-line-wide" />
              <div className="shimmer-line shimmer-line-medium" />
              <div className="recommendation-metrics recommendation-metrics-compact">
                <div className="recommendation-metric shimmer-card" />
                <div className="recommendation-metric shimmer-card" />
                <div className="recommendation-metric shimmer-card" />
                <div className="recommendation-metric shimmer-card" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
