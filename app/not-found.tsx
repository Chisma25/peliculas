import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel empty-state">
      <p className="eyebrow">404</p>
      <h1>Página no encontrada</h1>
      <p className="body-copy">La ruta no existe o la película ya no está disponible.</p>
      <Link href="/" className="secondary-button">
        Volver al dashboard
      </Link>
    </section>
  );
}
