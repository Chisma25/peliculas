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
          <h1>Este es vuestro rincón para decidir la peli de la semana.</h1>
          <div className="hero-copy-stack">
            <p className="body-copy">
              Aquí está todo lo vuestro: las películas que ya habéis visto, las que tenéis en pendientes y las
              recomendaciones semanales pensadas para vuestro grupo, no para cualquiera.
            </p>
            <p className="body-copy">
              El dashboard ahora os enseña tres descubrimientos reales: películas que todavía no habéis visto y que ni
              siquiera están en pendientes, para que siempre entren ideas nuevas al radar.
            </p>
          </div>
          <div className="chips">
            <span>Vuestras vistas</span>
            <span>Vuestras notas</span>
            <span>Descubrimientos nuevos</span>
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
          <p className="eyebrow">Película elegida</p>
          {dashboard.selectedMovie ? (
            <div className="selected-hero-layout">
              <div className="selected-hero-poster">
                <MoviePoster movie={dashboard.selectedMovie} href={`/peliculas/${dashboard.selectedMovie.slug}`} compact />
              </div>
              <div className="selected-hero-copy">
                <h2 className="selected-hero-title">{dashboard.selectedMovie.title}</h2>
                <div className="selected-hero-facts">
                  <span>{dashboard.selectedMovie.year > 0 ? dashboard.selectedMovie.year : "Año pendiente"}</span>
                  <span>{dashboard.selectedMovie.genres.slice(0, 2).join(" / ")}</span>
                </div>
                <div className="selected-hero-rating">
                  <span>{dashboard.selectedMovie.externalRating.source}</span>
                  <strong>{dashboard.selectedMovie.externalRating.value}</strong>
                </div>
                <p className="body-copy selected-hero-text">
                  {dashboard.selectedWatchEntry
                    ? "Ya está dentro de vuestras vistas y podéis seguir puntuándola desde su ficha."
                    : "Es la peli marcada para esta semana. Podéis abrir su ficha o pasarla a vistas cuando la hayáis visto."}
                </p>
                <div className="hero-actions">
                  <Link href={`/peliculas/${dashboard.selectedMovie.slug}`} className="secondary-button">
                    Abrir ficha
                  </Link>
                  {dashboard.selectedWatchEntry ? (
                    <span className="secondary-button">Ya está en vistas</span>
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
              <p className="body-copy">Aún no hay película marcada para esta semana.</p>
            </div>
          )}
        </article>
      </section>

      <section className="stat-grid dashboard-stat-grid">
        <article className="stat-card">
          <p className="eyebrow">Películas vistas</p>
          <strong>{dashboard.stats.watchedCount}</strong>
          <p className="body-copy">Todas las pelis que ya habéis visto juntos.</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Nota media del grupo</p>
          <strong>{formatScore(dashboard.stats.averageScore)}</strong>
          <p className="body-copy">Calculada con vuestras notas individuales.</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Pendientes</p>
          <strong>{dashboard.stats.pendingCount}</strong>
          <p className="body-copy">Películas guardadas para decidir próximas semanas.</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel dashboard-panel-main">
          <div className="panel-header">
            <p className="eyebrow">3 descubrimientos fuera de pendientes</p>
            <h2>{dashboard.batch ? `Tanda del ${formatLongDate(dashboard.batch.weekOf)}` : "Sin tanda generada"}</h2>
          </div>
          <div className="recommendation-stack">
            {dashboard.recommendations.length > 0 ? (
              dashboard.recommendations.map((item) =>
                dashboard.batch ? (
                  <RecommendationCard key={item.id} item={item} batchId={dashboard.batch.id} eyebrow="Descubrimiento semanal" />
                ) : null
              )
            ) : (
              <div className="empty-state">
                <p className="body-copy">Ahora mismo no hay suficientes descubrimientos nuevos fuera de vistas y pendientes.</p>
              </div>
            )}
          </div>
        </article>

        <aside className="panel activity-panel">
          <div className="panel-header">
            <p className="eyebrow">Actividad reciente</p>
            <h2>Movimiento del grupo</h2>
          </div>
          <div className="activity-list">
            {dashboard.recentActivity.length > 0 ? (
              dashboard.recentActivity.map((item) => (
                <article key={`${item.date}-${item.label}`}>
                  <div className="stat-row">
                    <strong>{item.label}</strong>
                    <span>{formatShortDate(item.date)}</span>
                  </div>
                </article>
              ))
            ) : (
              <article>
                <p className="body-copy">Aún no hay movimientos recientes del grupo.</p>
              </article>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}
