"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AccessibleDialog } from "@/components/accessible-dialog";

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
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function submitUpdate(formData: FormData) {
    try {
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
    } catch {
      setIsError(true);
      setMessage("No se pudo contactar con el servidor. Inténtalo de nuevo.");
    }
  }

  function closeDialog() {
    if (!isPending) {
      setIsOpen(false);
    }
  }

  const modal =
    isOpen
      ? (
          <AccessibleDialog
            labelledBy={`member-access-${member.id}`}
            describedBy={`member-access-description-${member.id}`}
            className="account-modal-card"
            onClose={closeDialog}
          >
              <div className="account-modal-header">
                <div className="account-modal-copy">
                  <p className="eyebrow">Gestión del acceso</p>
                  <h2 id={`member-access-${member.id}`}>{member.name}</h2>
                  <p className="body-copy" id={`member-access-description-${member.id}`}>
                    Ajusta el usuario con el que entra y, si hace falta, fija una contraseña nueva sin tocar el resto
                    de su perfil.
                  </p>
                </div>
                <button type="button" className="ghost-button" onClick={closeDialog} disabled={isPending}>
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
                  <button type="button" className="secondary-button" onClick={closeDialog} disabled={isPending}>
                    Cancelar
                  </button>
                  <button type="submit" className="primary-button" disabled={isPending}>
                    {isPending ? "Guardando..." : "Guardar acceso"}
                  </button>
                </div>
              </form>

              {message ? (
                <div
                  className={`inline-card member-card-feedback ${isError ? "error-card" : "success-card"}`}
                  role={isError ? "alert" : "status"}
                  aria-live="polite"
                >
                  <strong>{message}</strong>
                </div>
              ) : null}
          </AccessibleDialog>
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="ghost-button"
        onClick={() => {
          setMessage("");
          setIsError(false);
          setIsOpen(true);
        }}
      >
        Gestionar acceso
      </button>
      {modal}
    </>
  );
}
