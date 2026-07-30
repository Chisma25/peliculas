"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

export function ResetCredentialsPanel() {
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function submitReset(formData: FormData) {
    const response = await fetch("/api/auth/reset-credentials", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as { error?: string; message?: string };
    setIsError(!response.ok);
    setMessage(payload.message ?? payload.error ?? "Acceso restablecido.");
  }

  return (
    <section className="reset-screen" aria-labelledby="reset-title">
      <header className="reset-cinema-copy">
        <p className="cinema-kicker">Recuperar cuenta</p>
        <h1 id="reset-title">Restablecer acceso</h1>
        <p className="body-copy">
          Esta pantalla es solo para emergencias. Necesitas el código de administración del grupo para fijar un nuevo
          usuario y una nueva contraseña.
        </p>
        <span>Uso excepcional</span>
      </header>

      <div className="reset-form-panel">
        <form
          className="stack-form reset-form"
          action={(formData) =>
            startTransition(() => {
              void submitReset(formData);
            })
          }
        >
          <label>
            Código de administración
            <input type="password" name="adminCode" placeholder="Código del grupo" required autoComplete="one-time-code" />
          </label>
          <label>
            Usuario actual o nombre visible
            <input type="text" name="identifier" placeholder="Isma o Ismael Díaz" required />
          </label>
          <label>
            Nuevo usuario
            <input type="text" name="username" placeholder="isma" required autoComplete="username" />
          </label>
          <label>
            Nueva contraseña
            <input type="password" name="password" placeholder="Nueva contraseña" required autoComplete="new-password" />
          </label>
          <button type="submit" className="primary-button" disabled={isPending}>
            {isPending ? "Restableciendo..." : "Restablecer acceso"}
          </button>
        </form>

        {message ? (
          <div className={`inline-card ${isError ? "error-card" : "success-card"}`}>
            <strong>{message}</strong>
          </div>
        ) : null}

        <Link href="/login" className="cinema-text-link">
          Volver al login <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
