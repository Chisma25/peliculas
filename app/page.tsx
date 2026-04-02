import Link from "next/link";

import { MoviePoster } from "@/components/movie-poster";
import { getDashboardDataHydrated } from "@/lib/store";
import { formatScore, formatShortDate } from "@/lib/utils";

export default async function HomePage() {
  const dashboard = await getDashboardDataHydrated();

  return (
    <>
      <section className="hero-grid">
        <article className="hero-card hero-card-main hero-card-span-two">
          <p className="eyebrow">Nuestro grupo de cine</p>
          <h1>Este es vuestro rincón para decidir la peli de la semana.</h1>
          <div className="hero-copy-stack">
            <p className="body-copy">
              Aquí está todo lo vuestro: las películas que ya habéis visto, las que tenéis en pendientes y la película que
              toca esta semana, sin ruido extra ni capas que no os aporten.
            </p>
            <p className="body-copy">
              La idea es simple: tener en un solo sitio vuestras vistas, notas y decisiones semanales para que elegir entre
              vosotros sea rápido y quede todo bien guardado.
            </p>
          </div>
          <div className="chips">
            <span>Vuestras vistas</span>
            <span>Vuestras notas</span>
            <span>Película semanal</span>
          </div>
          <div className="hero-actions">
            <Link href="/pendientes" className="primary-button">
              Ver pendientes
            </Link>
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

      <section className="dashboard-grid dashboard-grid-single">
        <aside className="panel activity-panel activity-panel-wide">
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
