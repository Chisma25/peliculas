"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

type RatingPanelProps = {
  movieId: string;
  initialScore?: number;
  initialComment?: string;
};

export function RatingPanel({ movieId, initialScore, initialComment }: RatingPanelProps) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function submitRating(formData: FormData) {
    const response = await fetch("/api/ratings/create-or-update", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as { message?: string; error?: string };
    setMessage(payload.message ?? payload.error ?? "Puntuación actualizada.");
  }

  const editingExistingRating = typeof initialScore === "number";
  const modal =
    isOpen && mounted
      ? createPortal(
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rating-modal-title">
            <section className="modal-card">
              <div className="panel-header">
                <p className="eyebrow">Tu valoración</p>
              </div>
              <h2 id="rating-modal-title">{editingExistingRating ? "Edita tu valoración" : "Puntúa esta película"}</h2>
              <p className="body-copy">
                {editingExistingRating
                  ? "Tu nota actual ya aparece cargada. Cámbiala y guarda para actualizarla."
                  : "La nota es obligatoria. El comentario es opcional y puedes añadirlo ahora o más adelante."}
              </p>

              <form
                className="stack-form"
                action={(formData) =>
                  startTransition(() => {
                    formData.set("movieId", movieId);
                    void submitRating(formData);
                  })
                }
              >
                <label>
                  Nota (0-10)
                  <input
                    type="number"
                    name="score"
                    step="0.01"
                    min="0"
                    max="10"
                    defaultValue={initialScore?.toString() ?? ""}
                    required
                  />
                </label>
                <label>
                  Comentario opcional
                  <textarea
                    name="comment"
                    rows={4}
                    defaultValue={initialComment ?? ""}
                    placeholder="Qué te ha gustado, qué te ha sorprendido o cualquier apunte que quieras dejar."
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setIsOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="primary-button" disabled={isPending}>
                    {isPending ? "Guardando..." : editingExistingRating ? "Actualizar valoración" : "Guardar valoración"}
                  </button>
                </div>
                {message ? <p className="status-text">{message}</p> : null}
              </form>
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button type="button" className="primary-button" onClick={() => setIsOpen(true)}>
        {editingExistingRating ? "Editar mi valoración" : "Valorar película"}
      </button>
      {modal}
    </>
  );
}
