import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel empty-state">
      <p className="eyebrow">404</p>
      <h1>Esta película no está en cartelera</h1>
      <p className="body-copy">La ruta no existe o la ficha todavía no se ha cargado en vuestras vistas.</p>
      <Link href="/" className="secondary-button">
        Volver al dashboard
      </Link>
    </section>
  );
}
