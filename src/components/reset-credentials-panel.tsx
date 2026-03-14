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
    <section className="panel login-panel">
      <div className="panel-header">
        <p className="eyebrow">Reset del grupo</p>
        <h1>Restablece una cuenta</h1>
        <p className="body-copy">
          Esta pantalla es solo para emergencias. Necesitas el codigo de administracion del grupo para fijar un nuevo
          usuario y una nueva contrasena.
        </p>
      </div>

      <form
        className="stack-form"
        action={(formData) =>
          startTransition(() => {
            void submitReset(formData);
          })
        }
      >
        <label>
          Codigo de administracion
          <input type="password" name="adminCode" placeholder="Codigo del grupo" required autoComplete="one-time-code" />
        </label>
        <label>
          Usuario actual o nombre visible
          <input type="text" name="identifier" placeholder="Isma o Ismael Diaz" required />
        </label>
        <label>
          Nuevo usuario
          <input type="text" name="username" placeholder="isma" required autoComplete="username" />
        </label>
        <label>
          Nueva contrasena
          <input type="password" name="password" placeholder="Nueva contrasena" required autoComplete="new-password" />
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

      <Link href="/login" className="secondary-button">
        Volver al login
      </Link>
    </section>
  );
}
