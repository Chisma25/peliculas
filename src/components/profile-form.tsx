"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ProfileFormProps = {
  initialName: string;
  initialUsername: string;
};

export function ProfileForm({ initialName, initialUsername }: ProfileFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function submitProfile(formData: FormData) {
    const response = await fetch("/api/profile/update", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as { error?: string; message?: string };
    setIsError(!response.ok);
    setMessage(payload.message ?? payload.error ?? "Perfil actualizado.");

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Tu perfil</p>
        <h1>Actualiza tu cuenta</h1>
      </div>
      <p className="body-copy">
        Si cambias tu nombre visible, las valoraciones antiguas seguirán siendo tuyas y se actualizarán en todas las
        fichas automáticamente.
      </p>

      <form
        className="stack-form"
        action={(formData) =>
          startTransition(() => {
            void submitProfile(formData);
          })
        }
      >
        <label>
          Nombre visible
          <input type="text" name="name" defaultValue={initialName} required />
        </label>
        <label>
          Usuario
          <input type="text" name="username" defaultValue={initialUsername} required autoComplete="username" />
        </label>
        <label>
          Nueva contraseña
          <input type="password" name="password" placeholder="Solo si quieres cambiarla" autoComplete="new-password" />
        </label>
        <button type="submit" className="primary-button" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>

      {message ? (
        <div className={`inline-card ${isError ? "error-card" : "success-card"}`}>
          <strong>{message}</strong>
        </div>
      ) : null}
    </section>
  );
}
