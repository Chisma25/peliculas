import Link from "next/link";

import { MoviePoster } from "@/components/movie-poster";
import { Movie, WeeklyRecommendationItem } from "@/lib/types";
import { formatScore } from "@/lib/utils";

type RecommendationCardProps = {
  item: WeeklyRecommendationItem & { movie: Movie; selected: boolean };
  batchId: string;
};

export function RecommendationCard({ item, batchId }: RecommendationCardProps) {
  return (
    <article className={`recommendation-card ${item.selected ? "selected-card" : ""}`}>
      <MoviePoster movie={item.movie} href={`/peliculas/${item.movie.slug}`} compact />
      <div className="recommendation-copy">
        <div className="recommendation-topline">
          <p className="eyebrow">{item.selected ? "Elegida esta semana" : "Opción semanal"}</p>
          <span>{formatScore(item.score / 10)}/10 encaje</span>
        </div>
        <h3>{item.movie.title}</h3>
        <p className="body-copy">
          <strong>Por qué verla:</strong> {item.summary}
        </p>
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
