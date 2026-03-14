import Link from "next/link";

import { MoviePoster } from "@/components/movie-poster";
import { RecommendationCard } from "@/components/recommendation-card";
import { getDashboardDataHydrated } from "@/lib/store";
import { formatLongDate, formatScore, formatShortDate } from "@/lib/utils";

export default async function HomePage() {
  const dashboard = await getDashboardDataHydrated();

  return (
    <>
      <section className="hero-grid">
        <article className="hero-card hero-card-main">
          <p className="eyebrow">Nuestro grupo de cine</p>
          <h1>Este es vuestro rincon para decidir la peli de la semana.</h1>
          <div className="hero-copy-stack">
            <p className="body-copy">
              Aqui esta todo lo vuestro: las peliculas que ya habeis visto, las que teneis en pendientes y las
              recomendaciones semanales pensadas para vuestro grupo, no para cualquiera.
            </p>
            <p className="body-copy">
              La idea es simple: tener en un solo sitio lo que antes llevabais en el Excel, pero con mejor pinta y mas
              facil para decidir entre vosotros que toca ver esta semana.
            </p>
          </div>
          <div className="chips">
            <span>Vuestras vistas</span>
            <span>Vuestras notas</span>
            <span>Vuestra peli de la semana</span>
          </div>
          <div className="hero-actions">
            <form action="/api/weekly-recommendations/generate" method="post">
              <button type="submit" className="primary-button">
                Generar nuevas recomendaciones
              </button>
            </form>
            <Link href="/explorar" className="secondary-button">
              Buscar en TMDb
            </Link>
          </div>
        </article>

        <article className="hero-card selected-hero-card">
          <p className="eyebrow">Pelicula elegida</p>
          {dashboard.selectedMovie ? (
            <div className="selected-hero-layout">
              <div className="selected-hero-poster">
                <MoviePoster movie={dashboard.selectedMovie} href={`/peliculas/${dashboard.selectedMovie.slug}`} compact />
              </div>
              <div className="selected-hero-copy">
                <h2 className="selected-hero-title">{dashboard.selectedMovie.title}</h2>
                <div className="selected-hero-facts">
                  <span>{dashboard.selectedMovie.year > 0 ? dashboard.selectedMovie.year : "Ano pendiente"}</span>
                  <span>{dashboard.selectedMovie.genres.slice(0, 2).join(" / ")}</span>
                </div>
                <div className="selected-hero-rating">
                  <span>{dashboard.selectedMovie.externalRating.source}</span>
                  <strong>{dashboard.selectedMovie.externalRating.value}</strong>
                </div>
                <p className="body-copy selected-hero-text">
                  {dashboard.selectedWatchEntry
                    ? "Ya esta dentro de vuestras vistas y podeis seguir puntuandola desde su ficha."
                    : "Es la peli marcada para esta semana. Podeis abrir su ficha o pasarla a vistas cuando la hayais visto."}
                </p>
                <div className="hero-actions">
                <Link href={`/peliculas/${dashboard.selectedMovie.slug}`} className="secondary-button">
                  Abrir ficha
                </Link>
                {dashboard.selectedWatchEntry ? (
                  <span className="secondary-button">Ya esta en vistas</span>
                ) : (
                  <form action="/api/watch/mark-watched" method="post">
                    <input type="hidden" name="movieId" value={dashboard.selectedMovie.id} />
                    <input type="hidden" name="redirectTo" value="/" />
                    <button type="submit" className="primary-button">
                      Marcar como vista
                    </button>
                  </form>
                )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p className="body-copy">Aun no hay pelicula marcada para esta semana.</p>
            </div>
          )}
        </article>
      </section>

      <section className="stat-grid dashboard-stat-grid">
        <article className="stat-card">
          <p className="eyebrow">Peliculas vistas</p>
          <strong>{dashboard.stats.watchedCount}</strong>
          <p className="body-copy">Todas las pelis que ya habeis visto juntos.</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Nota media del grupo</p>
          <strong>{formatScore(dashboard.stats.averageScore)}</strong>
          <p className="body-copy">Calculada con vuestras notas individuales.</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Pendientes</p>
          <strong>{dashboard.stats.pendingCount}</strong>
          <p className="body-copy">Peliculas guardadas para decidir proximas semanas.</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel dashboard-panel-main">
          <div className="panel-header">
            <p className="eyebrow">5 opciones para esta semana</p>
            <h2>{dashboard.batch ? `Tanda del ${formatLongDate(dashboard.batch.weekOf)}` : "Sin tanda generada"}</h2>
          </div>
          <div className="recommendation-stack">
            {dashboard.recommendations.map((item) =>
              dashboard.batch ? <RecommendationCard key={item.id} item={item} batchId={dashboard.batch.id} /> : null
            )}
          </div>
        </article>

        <aside className="panel activity-panel">
          <div className="panel-header">
            <p className="eyebrow">Actividad reciente</p>
            <h2>Movimiento del grupo</h2>
          </div>
          <div className="activity-list">
            {dashboard.recentActivity.map((item) => (
              <article key={`${item.date}-${item.label}`}>
                <div className="stat-row">
                  <strong>{item.label}</strong>
                  <span>{formatShortDate(item.date)}</span>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
