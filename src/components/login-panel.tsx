"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type LoginPanelProps = {
  nextPath?: string;
};

export function LoginPanel({ nextPath }: LoginPanelProps) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  async function login(formData: FormData) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as { error?: string; redirectTo?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "No se pudo iniciar sesión.");
      return;
    }

    const destination = payload.redirectTo && payload.redirectTo.startsWith("/") ? payload.redirectTo : "/";
    window.location.assign(destination);
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

      <form
        className="stack-form"
        action={(formData) =>
          startTransition(() => {
            void login(formData);
          })
        }
      >
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
        <div className="inline-card error-card">
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
