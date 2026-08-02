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
    <section className="login-screen" aria-labelledby="login-title">
      <div className="login-cinema-copy" aria-hidden="true">
        <p className="cinema-kicker">Filmoteca privada</p>
        <h2>Cine Semanal</h2>
        <p>Películas, notas y pendientes del grupo.</p>
        <div className="login-cinema-reel">
          <span>Películas</span>
          <i />
          <span>Notas</span>
          <i />
          <span>Pendientes</span>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-form-heading">
          <span className="login-form-led" aria-hidden="true" />
          <div>
            <p className="eyebrow">Tu cuenta</p>
            <h1 id="login-title">Iniciar sesión</h1>
          </div>
        </div>

        <form className="login-form" method="post" onSubmit={handleSubmit}>
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <label>
            <span>Usuario</span>
            <input type="text" name="username" placeholder="Tu usuario" required autoComplete="username" />
          </label>
          <label>
            <span>Contraseña</span>
            <input type="password" name="password" placeholder="Tu contraseña" required autoComplete="current-password" />
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
            ¿No puedes entrar?
          </Link>
        </div>
      </div>
    </section>
  );
}
