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
        setMessage(payload.error ?? "No se pudo iniciar sesion.");
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
    <section className="login-screen" aria-labelledby="login-title">
      <div className="login-form-panel">
        <div className="login-form-heading">
          <span className="login-form-led" aria-hidden="true" />
          <div>
            <p className="eyebrow">Acceso del grupo</p>
            <h1 id="login-title">Iniciar sesion</h1>
          </div>
        </div>

        <form className="login-form" method="post" onSubmit={handleSubmit}>
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <label>
            <span>Usuario</span>
            <input type="text" name="username" required autoComplete="username" />
            <small>Usa tu usuario asignado o tu nombre visible.</small>
          </label>
          <label>
            <span>Contraseña</span>
            <input type="password" name="password" required autoComplete="current-password" />
            <small>Minimo 8 caracteres si la cambias desde perfil.</small>
          </label>
          <button type="submit" className="primary-button" disabled={isPending}>
            {isPending ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {message ? (
          <div className="login-message error-card" role="alert" aria-live="polite">
            <strong>{message}</strong>
          </div>
        ) : null}

        <div className="login-panel-reset">
          <Link href="/reset-credenciales" className="ghost-button">
            Reset de emergencia
          </Link>
        </div>
      </div>
    </section>
  );
}
