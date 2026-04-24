"use client";

import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";

type LoginPanelProps = {
  nextPath?: string;
};

export function LoginPanel({ nextPath }: LoginPanelProps) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function getSafeDestination(apiDestination?: string) {
    const destination = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : apiDestination;

    return destination && destination.startsWith("/") && !destination.startsWith("//") ? destination : "/";
  }

  async function login(formData: FormData) {
    setMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "No se pudo iniciar sesión.");
        return;
      }

      window.location.assign(getSafeDestination(payload.redirectTo));
    } catch {
      setMessage("No se pudo contactar con el servidor. Prueba otra vez en unos segundos.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void login(formData);
    });
  }

  return (
    <section className="panel login-panel">
      <div className="panel-header">
        <p className="eyebrow">Acceso del grupo</p>
        <h1>Entrad con usuario y contraseña</h1>
        <p className="body-copy">
          Cada uno tiene ya su cuenta creada. En cuanto entréis podéis cambiar el nombre visible, el usuario y la
          contraseña desde vuestro perfil.
        </p>
      </div>

      <form className="stack-form" method="post" onSubmit={handleSubmit}>
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
        <label>
          Usuario
          <input type="text" name="username" placeholder="Isma" required autoComplete="username" />
        </label>
        <label>
          Contraseña
          <input type="password" name="password" placeholder="Tu contraseña" required autoComplete="current-password" />
        </label>
        <button type="submit" className="primary-button" disabled={isPending}>
          {isPending ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {message ? (
        <div className="inline-card error-card" role="alert" aria-live="polite">
          <strong>{message}</strong>
        </div>
      ) : null}

      <div className="inline-actions login-panel-reset">
        <Link href="/reset-credenciales" className="secondary-button">
          Reset de emergencia
        </Link>
      </div>
    </section>
  );
}
