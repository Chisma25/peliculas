"use client";

import { useEffect } from "react";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error("[app] Se mostró el estado de mantenimiento.", {
      digest: error.digest
    });
  }, [error.digest]);

  return (
    <section className="service-unavailable" role="alert">
      <div className="service-unavailable-copy">
        <p className="eyebrow">Pausa segura</p>
        <h1>La filmoteca está a salvo.</h1>
        <p>
          Ahora mismo no podemos leer los datos con garantías. Hemos detenido el flujo para no enseñarte
          información antigua ni aceptar cambios a medias.
        </p>
      </div>

      <div className="service-unavailable-actions">
        <button type="button" className="primary-button" onClick={reset}>
          Volver a intentar
        </button>
        <a className="ghost-button" href="/login">
          Volver al acceso
        </a>
      </div>

      {error.digest ? <code className="service-unavailable-reference">Referencia: {error.digest}</code> : null}
    </section>
  );
}
