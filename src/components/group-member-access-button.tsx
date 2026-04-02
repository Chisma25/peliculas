"use client";

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState, useTransition } from "react";

type GroupMemberAccessButtonProps = {
  member: {
    id: string;
    name: string;
    username: string;
    isAdmin?: boolean;
  };
};

export function GroupMemberAccessButton({ member }: GroupMemberAccessButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function submitUpdate(formData: FormData) {
    const response = await fetch("/api/admin/users/update", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as { error?: string; message?: string };
    const nextMessage = payload.message ?? payload.error ?? "Acceso actualizado.";

    setIsError(!response.ok);
    setMessage(nextMessage);

    if (response.ok) {
      setIsOpen(false);
      router.refresh();
    }
  }

  const modal =
    isOpen && mounted
      ? createPortal(
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={`member-access-${member.id}`}>
            <section className="modal-card account-modal-card">
              <div className="account-modal-header">
                <div className="account-modal-copy">
                  <p className="eyebrow">Gestión del acceso</p>
                  <h2 id={`member-access-${member.id}`}>{member.name}</h2>
                  <p className="body-copy">
                    Ajusta el usuario con el que entra y, si hace falta, fija una contraseña nueva sin tocar el resto
                    de su perfil.
                  </p>
                </div>
                <button type="button" className="ghost-button" onClick={() => setIsOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div className="account-modal-badges">
                <span className="status-pill">@{member.username}</span>
                {member.isAdmin ? <span className="status-pill status-pill-accent">Administrador</span> : null}
              </div>

              <form
                className="stack-form"
                action={(formData) =>
                  startTransition(() => {
                    formData.set("userId", member.id);
                    void submitUpdate(formData);
                  })
                }
              >
                <label>
                  Usuario
                  <input type="text" name="username" defaultValue={member.username} required autoComplete="username" />
                </label>
                <label>
                  Nueva contraseña
                  <input type="password" name="password" placeholder="Solo si quieres cambiarla" autoComplete="new-password" />
                </label>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setIsOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="primary-button" disabled={isPending}>
                    {isPending ? "Guardando..." : "Guardar acceso"}
                  </button>
                </div>
              </form>

              {message ? (
                <div className={`inline-card member-card-feedback ${isError ? "error-card" : "success-card"}`}>
                  <strong>{message}</strong>
                </div>
              ) : null}
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button type="button" className="ghost-button" onClick={() => setIsOpen(true)}>
        Gestionar acceso
      </button>
      {modal}
    </>
  );
}
