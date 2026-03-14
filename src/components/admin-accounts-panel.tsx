"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AdminAccountsPanelProps = {
  members: Array<{
    id: string;
    name: string;
    username: string;
    isAdmin?: boolean;
  }>;
};

export function AdminAccountsPanel({ members }: AdminAccountsPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function submitUpdate(formData: FormData) {
    const response = await fetch("/api/admin/users/update", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as { error?: string; message?: string };
    setIsError(!response.ok);
    setMessage(payload.message ?? payload.error ?? "Cuenta actualizada.");

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="eyebrow">Gestion del grupo</p>
        <h2>Cuentas del grupo</h2>
        <p className="body-copy">
          Como administrador puedes corregir usuarios y restablecer contraseñas sin entrar en el perfil privado de cada
          uno.
        </p>
      </div>

      <div className="member-list">
        {members.map((member) => (
          <article key={member.id} className="member-card member-card-form">
            <div className="stat-row">
              <strong>{member.name}</strong>
              <span>{member.isAdmin ? "Administrador" : `@${member.username}`}</span>
            </div>

            <form
              className="stack-form"
              action={(formData) =>
                startTransition(() => {
                  void submitUpdate(formData);
                })
              }
            >
              <input type="hidden" name="userId" value={member.id} />
              <label>
                Usuario
                <input type="text" name="username" defaultValue={member.username} required autoComplete="username" />
              </label>
              <label>
                Nueva contrasena
                <input type="password" name="password" placeholder="Solo si quieres cambiarla" autoComplete="new-password" />
              </label>
              <button type="submit" className="primary-button" disabled={isPending}>
                {isPending ? "Guardando..." : "Guardar acceso"}
              </button>
            </form>
          </article>
        ))}
      </div>

      {message ? (
        <div className={`inline-card ${isError ? "error-card" : "success-card"}`}>
          <strong>{message}</strong>
        </div>
      ) : null}
    </section>
  );
}
