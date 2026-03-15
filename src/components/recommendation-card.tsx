import Link from "next/link";

import { MoviePoster } from "@/components/movie-poster";
import { Movie, WeeklyRecommendationItem } from "@/lib/types";
import { formatFitScore } from "@/lib/utils";

type RecommendationCardProps = {
  item: WeeklyRecommendationItem & { movie: Movie; selected: boolean };
  batchId: string;
  eyebrow?: string;
  compact?: boolean;
};

export function RecommendationCard({ item, batchId, eyebrow, compact = false }: RecommendationCardProps) {
  const metrics = item.metrics ?? [];

  if (compact) {
    return (
      <article className={`recommendation-card-compact-panel ${item.selected ? "selected-card" : ""}`}>
        <div className="recommendation-card-compact-poster">
          <MoviePoster movie={item.movie} href={`/peliculas/${item.movie.slug}`} compact />
        </div>
        <div className="recommendation-card-compact-copy">
          <div className="recommendation-topline">
            <p className="eyebrow">{item.selected ? "Elegida" : eyebrow ?? "Recomendada"}</p>
            <span className="recommendation-fit-badge recommendation-fit-badge-compact">{formatFitScore(item.score)}/100</span>
          </div>
          <h3>{item.movie.title}</h3>
          {metrics.length > 0 ? (
            <div className="recommendation-metrics recommendation-metrics-compact">
              {metrics.map((metric) => (
                <div key={`${item.id}-${metric.label}`} className={`recommendation-metric recommendation-metric-${metric.tone ?? "neutral"}`}>
                  <small>{metric.label}</small>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          <div className="recommendation-actions recommendation-actions-compact">
            <Link href={`/peliculas/${item.movie.slug}`} className="secondary-button">
              Ver ficha
            </Link>
            <form action="/api/weekly-recommendations/select" method="post">
              <input type="hidden" name="batchId" value={batchId} />
              <input type="hidden" name="movieId" value={item.movie.id} />
              <button type="submit" className="primary-button">
                {item.selected ? "Ya seleccionada" : "Elegir"}
              </button>
            </form>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`recommendation-card ${item.selected ? "selected-card" : ""}`}>
      <MoviePoster
        movie={item.movie}
        href={`/peliculas/${item.movie.slug}`}
        compact
        showDetails={false}
        metaLabel={item.movie.genres.slice(0, 1).join(" / ")}
      />
      <div className="recommendation-copy">
        <div className="recommendation-topline">
          <p className="eyebrow">{item.selected ? "Elegida esta semana" : eyebrow ?? "Descubrimiento semanal"}</p>
          <span className="recommendation-fit-badge">{formatFitScore(item.score)}/100</span>
        </div>
        <div className="recommendation-title-stack">
          <h3>{item.movie.title}</h3>
          <p className="recommendation-director">Dirige {item.movie.director}</p>
        </div>
        {metrics.length > 0 ? (
          <div className="recommendation-metrics">
            {metrics.map((metric) => (
              <div key={`${item.id}-${metric.label}`} className={`recommendation-metric recommendation-metric-${metric.tone ?? "neutral"}`}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        <div className="recommendation-actions">
          <Link href={`/peliculas/${item.movie.slug}`} className="secondary-button">
            Ver ficha
          </Link>
          <form action="/api/weekly-recommendations/select" method="post">
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="movieId" value={item.movie.id} />
            <button type="submit" className="primary-button">
              {item.selected ? "Ya seleccionada" : "Elegir para esta semana"}
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
