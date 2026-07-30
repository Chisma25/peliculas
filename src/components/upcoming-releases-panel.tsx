import { PosterImage } from "@/components/poster-image";
import { getUpcomingDashboardReleasesHydrated } from "@/lib/store";
import { formatLongDate, formatShortDate } from "@/lib/utils";

function getTmdbMovieUrl(tmdbId?: string) {
  return tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : undefined;
}

export async function UpcomingReleasesPanel() {
  const upcomingReleases = await getUpcomingDashboardReleasesHydrated();

  return (
    <section className="cinema-releases">
      <div className="cinema-releases-heading">
        <div>
          <p className="cinema-kicker">Estrenos</p>
          <h2>Próximamente</h2>
        </div>
        <p className="body-copy">
          Tres próximos estrenos que pueden interesaros.
        </p>
      </div>

      {upcomingReleases.length > 0 ? (
        <div className="cinema-release-grid">
          {upcomingReleases.map((item, index) => {
            const tmdbUrl = getTmdbMovieUrl(item.movie.sourceIds?.tmdb);
            const artwork = item.movie.posterUrl || item.movie.backdrop;

            return (
              <article key={item.movie.id} className={`cinema-release-card cinema-release-card-${index + 1}`}>
                <div className="cinema-release-art" aria-hidden="true">
                  <PosterImage src={artwork} />
                </div>
                <div className="cinema-release-scrim" />

                <div className="cinema-release-copy">
                  <span className="cinema-release-number">0{index + 1}</span>
                  <div>
                    <p className="cinema-release-date">{formatShortDate(item.releaseDate)}</p>
                    <h3>{item.movie.title}</h3>
                    <p className="cinema-release-byline">
                      {item.movie.director} · {item.movie.genres.slice(0, 2).join(" / ") || "Próximo estreno"}
                    </p>
                    <p className="cinema-release-full-date">En España, {formatLongDate(item.releaseDate)}</p>
                    {tmdbUrl ? (
                      <a href={tmdbUrl} target="_blank" rel="noreferrer" className="cinema-text-link">
                        Ver en TMDb <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span className="cinema-text-link cinema-text-link-disabled">Sin enlace</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="cinema-release-empty">
          <span aria-hidden="true">Estrenos</span>
          <p>No hemos encontrado estrenos relevantes para el próximo mes.</p>
        </div>
      )}
    </section>
  );
}

export function UpcomingReleasesPanelFallback() {
  return (
    <section className="cinema-releases">
      <div className="cinema-releases-heading">
        <div>
          <p className="cinema-kicker">Estrenos</p>
          <h2>Próximamente</h2>
        </div>
        <p className="body-copy">Preparando los próximos estrenos…</p>
      </div>

      <div className="cinema-release-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <article
            key={index}
            className={`cinema-release-card cinema-release-card-${index + 1} cinema-release-skeleton`}
            aria-hidden="true"
          >
            <div className="cinema-release-skeleton-line" />
            <div className="cinema-release-skeleton-line cinema-release-skeleton-line-short" />
          </article>
        ))}
      </div>
    </section>
  );
}
