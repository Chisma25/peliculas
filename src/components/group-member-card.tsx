"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState, useTransition } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { formatScore } from "@/lib/utils";

type GroupMemberCardProps = {
  member: {
    id: string;
    name: string;
    username: string;
    avatarUrl?: string;
    isAdmin?: boolean;
  };
  profileSummary: {
    ratingsCount: number;
    averageScore: number;
    bestScore: number;
  };
  profileHref: string;
  canManage: boolean;
};

export function GroupMemberCard({ member, profileSummary, profileHref, canManage }: GroupMemberCardProps) {
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
                <div className="member-card-head">
                  <UserAvatar user={member} size="md" />
                  <div className="member-card-heading">
                    <strong>{member.name}</strong>
                    <span>@{member.username}</span>
                  </div>
                </div>
                <button type="button" className="ghost-button" onClick={() => setIsOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div className="panel-header account-modal-copy">
                <p className="eyebrow">Gestión del acceso</p>
                <h2 id={`member-access-${member.id}`}>{member.name}</h2>
                <p className="body-copy">
                  Ajusta el usuario con el que entra y, si hace falta, fija una contraseña nueva sin tocar el resto de
                  su perfil.
                </p>
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
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <article className="member-card member-card-interactive">
        <div className="member-card-topline">
          <div className="member-card-head">
            <UserAvatar user={member} size="md" />
            <div className="member-card-heading">
              <strong>{member.name}</strong>
              <span>@{member.username}</span>
            </div>
          </div>
          {member.isAdmin ? <span className="status-pill status-pill-accent">Administrador</span> : null}
        </div>

        <div className="member-card-metrics">
          <div className="member-metric-chip">
            <small>Notas</small>
            <strong>{profileSummary.ratingsCount}</strong>
          </div>
          <div className="member-metric-chip">
            <small>Media</small>
            <strong>{profileSummary.ratingsCount ? formatScore(profileSummary.averageScore) : "-"}</strong>
          </div>
          <div className="member-metric-chip">
            <small>Techo</small>
            <strong>{profileSummary.ratingsCount ? formatScore(profileSummary.bestScore) : "-"}</strong>
          </div>
        </div>

        <div className="member-card-actions">
          <Link href={profileHref} className="secondary-button">
            Ver perfil
          </Link>
          {canManage ? (
            <button type="button" className="ghost-button" onClick={() => setIsOpen(true)}>
              Gestionar acceso
            </button>
          ) : null}
        </div>

        {message ? (
          <div className={`inline-card member-card-feedback ${isError ? "error-card" : "success-card"}`}>
            <strong>{message}</strong>
          </div>
        ) : null}
      </article>
      {modal}
    </>
  );
}
