import { PosterImage } from "@/components/poster-image";
import { getNowPlayingDashboardSuggestionsHydrated } from "@/lib/store";
import { formatShortDate } from "@/lib/utils";

function getTmdbMovieUrl(tmdbId?: string) {
  return tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : undefined;
}

export async function NowPlayingPanel() {
  const suggestions = await getNowPlayingDashboardSuggestionsHydrated();

  return (
    <section className="cinema-releases cinema-now-playing">
      <div className="cinema-releases-heading">
        <div>
          <p className="cinema-kicker">Cartelera</p>
          <h2>Ahora en cines</h2>
        </div>
        <p className="cinema-program-status">España · Selección actualizada</p>
      </div>

      {suggestions.length > 0 ? (
        <div className="cinema-release-grid">
          {suggestions.map((item, index) => {
            const tmdbUrl = getTmdbMovieUrl(item.movie.sourceIds?.tmdb);
            const artwork = item.movie.backdrop || item.movie.posterUrl;

            return (
              <article key={item.movie.id} className={`cinema-release-card cinema-release-card-${index + 1}`}>
                <div className="cinema-release-art" aria-hidden="true">
                  <PosterImage src={artwork} />
                </div>
                <div className="cinema-release-scrim" />

                <div className="cinema-release-copy">
                  <span className="cinema-release-number">0{index + 1}</span>
                  <div>
                    <p className="cinema-release-date">
                      {item.releaseDate ? `Desde el ${formatShortDate(item.releaseDate)}` : "Ahora en cartelera"}
                    </p>
                    <h3>{item.movie.title}</h3>
                    <p className="cinema-release-byline">
                      {item.movie.director} · {item.movie.genres.slice(0, 2).join(" / ") || "En cartelera"}
                    </p>
                    <p className="cinema-release-full-date">
                      {item.movie.externalRating.source} {item.movie.externalRating.value}
                    </p>
                    {tmdbUrl ? (
                      <a href={tmdbUrl} target="_blank" rel="noreferrer" className="cinema-text-link">
                        Ver en TMDb <span aria-hidden="true">↗</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="cinema-release-empty">
          <span aria-hidden="true">Cartelera</span>
          <p>No hemos podido preparar la selección de películas en cines.</p>
        </div>
      )}
    </section>
  );
}

export function NowPlayingPanelFallback() {
  return (
    <section className="cinema-releases cinema-now-playing">
      <div className="cinema-releases-heading">
        <div>
          <p className="cinema-kicker">Cartelera</p>
          <h2>Ahora en cines</h2>
        </div>
        <p className="cinema-program-status">Preparando la selección</p>
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
