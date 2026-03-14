"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useState, useTransition } from "react";

import { UserAvatar } from "@/components/user-avatar";

type ProfileFormProps = {
  initialName: string;
  initialUsername: string;
  initialAvatarUrl?: string;
};

export function ProfileForm({ initialName, initialUsername, initialAvatarUrl }: ProfileFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draftName, setDraftName] = useState(initialName);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [avatarAction, setAvatarAction] = useState<"keep" | "replace" | "remove">("keep");
  const [avatarPreview, setAvatarPreview] = useState(initialAvatarUrl ?? "");

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

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setIsError(true);
      setMessage("El avatar tiene que ser una imagen.");
      return;
    }

    if (file.size > 1_200_000) {
      setIsError(true);
      setMessage("El avatar es demasiado grande. Prueba con una imagen de menos de 1.2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setAvatarPreview(result);
      setAvatarDataUrl(result);
      setAvatarAction("replace");
      setIsError(false);
      setMessage("");
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    setAvatarPreview("");
    setAvatarDataUrl("");
    setAvatarAction("remove");
    setIsError(false);
    setMessage("");
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
        <input type="hidden" name="avatarAction" value={avatarAction} />
        <input type="hidden" name="avatarDataUrl" value={avatarDataUrl} />
        <div className="profile-avatar-editor">
          <div className="profile-avatar-preview">
            <UserAvatar user={{ name: draftName, avatarUrl: avatarPreview || undefined }} size="lg" />
          </div>
          <div className="profile-avatar-controls">
            <label className="avatar-upload-label">
              Imagen de avatar
              <input type="file" accept="image/*" onChange={handleAvatarChange} />
            </label>
            <p className="muted-copy">Se guarda dentro de la app, así que mejor una imagen pequeña.</p>
            {avatarPreview ? (
              <button type="button" className="ghost-button" onClick={removeAvatar}>
                Quitar avatar
              </button>
            ) : null}
          </div>
        </div>
        <label>
          Nombre visible
          <input
            type="text"
            name="name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            required
          />
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
