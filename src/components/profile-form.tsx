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
    <section className="profile-settings-panel" aria-labelledby="profile-settings-title">
      <div className="profile-section-heading">
        <div>
          <p className="eyebrow">Tu perfil</p>
          <h2 id="profile-settings-title">Cuenta y avatar</h2>
        </div>
        <p>Actualiza como apareces en el grupo sin tocar tus notas antiguas.</p>
      </div>

      <form
        className="profile-settings-form"
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
            <p className="muted-copy">Usa una imagen pequena para que cargue rapido.</p>
            {avatarPreview ? (
              <button type="button" className="ghost-button" onClick={removeAvatar}>
                Quitar avatar
              </button>
            ) : null}
          </div>
        </div>

        <div className="profile-form-grid">
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
          <label className="profile-form-wide">
            Nueva contrasena
            <input type="password" name="password" placeholder="Solo si quieres cambiarla" autoComplete="new-password" />
          </label>
        </div>

        <div className="profile-form-actions">
          <button type="submit" className="primary-button" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>

      {message ? (
        <div className={`profile-form-message ${isError ? "error-card" : "success-card"}`}>
          <strong>{message}</strong>
        </div>
      ) : null}
    </section>
  );
}
