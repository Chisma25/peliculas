"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { AccessibleDialog } from "@/components/accessible-dialog";
import { isQuarterPointScore } from "@/lib/utils";

type RatingPanelProps = {
  movieId: string;
  initialScore?: number;
  initialComment?: string;
};

export function RatingPanel({ movieId, initialScore, initialComment }: RatingPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [score, setScore] = useState(initialScore?.toString() ?? "");

  const editingExistingRating = typeof initialScore === "number";
  const closeDialog = useCallback(() => {
    if (!isPending) {
      setIsOpen(false);
      setError("");
      setScore(initialScore?.toString() ?? "");
    }
  }, [initialScore, isPending]);

  function updateScore(nextValue: string) {
    setScore(nextValue);
    setError("");
  }

  function adjustScore(direction: -1 | 1) {
    const parsedScore = Number.parseFloat(score.replace(",", "."));
    const baseScore = Number.isFinite(parsedScore) ? Math.round(parsedScore * 4) / 4 : 5;
    updateScore(String(Math.min(10, Math.max(0, baseScore + direction * 0.25))));
  }

  async function submitRating(formData: FormData) {
    setIsPending(true);
    try {
      const response = await fetch("/api/ratings/create-or-update", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo guardar la valoración.");
        return;
      }

      setMessage(payload.message ?? "Valoración actualizada.");
      setIsOpen(false);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="primary-button"
        onClick={() => {
          setMessage("");
          setError("");
          setScore(initialScore?.toString() ?? "");
          setIsOpen(true);
        }}
      >
        {editingExistingRating ? "Editar mi valoración" : "Valorar película"}
      </button>

      {message && !isOpen ? (
        <p className="status-text" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

      {isOpen ? (
        <AccessibleDialog labelledBy="rating-modal-title" describedBy="rating-modal-description" onClose={closeDialog}>
          <div className="panel-header">
            <p className="eyebrow">Tu valoración</p>
          </div>
          <h2 id="rating-modal-title">{editingExistingRating ? "Edita tu valoración" : "Puntúa esta película"}</h2>
          <p className="body-copy" id="rating-modal-description">
            {editingExistingRating
              ? "Tu nota actual ya aparece cargada. Cámbiala y guarda para actualizarla."
              : "La nota es obligatoria. El comentario es opcional y puedes añadirlo ahora o más adelante."}
          </p>

          <form
            className="stack-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const numericScore = Number.parseFloat(score.replace(",", "."));
              if (!isQuarterPointScore(numericScore)) {
                setError("Escribe una nota entre 0 y 10 que avance de 0,25 en 0,25.");
                return;
              }

              const formData = new FormData(event.currentTarget);
              formData.set("movieId", movieId);
              formData.set("score", String(numericScore));
              setError("");
              void submitRating(formData);
            }}
          >
            <div className="rating-score-field">
              <label htmlFor="rating-score">Nota</label>
              <div className="rating-score-control">
                <button
                  type="button"
                  className="rating-step-button"
                  aria-label="Restar 0,25 a la nota"
                  onClick={() => adjustScore(-1)}
                  disabled={isPending || Number.parseFloat(score) <= 0}
                >
                  −
                </button>
                <input
                  id="rating-score"
                  type="number"
                  name="score"
                  step="0.25"
                  min="0"
                  max="10"
                  inputMode="decimal"
                  value={score}
                  onChange={(event) => updateScore(event.target.value)}
                  data-dialog-autofocus
                  aria-describedby={`rating-score-help${error ? " rating-score-error" : ""}`}
                  aria-invalid={Boolean(error)}
                  required
                />
                <button
                  type="button"
                  className="rating-step-button"
                  aria-label="Sumar 0,25 a la nota"
                  onClick={() => adjustScore(1)}
                  disabled={isPending || Number.parseFloat(score) >= 10}
                >
                  +
                </button>
              </div>
              <div className="rating-score-guide" id="rating-score-help">
                <span>0</span>
                <strong>Pasos de 0,25</strong>
                <span>10</span>
              </div>
              {error ? (
                <p className="form-error" id="rating-score-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <label className="rating-comment-field">
              Comentario opcional
              <textarea
                name="comment"
                rows={4}
                defaultValue={initialComment ?? ""}
                placeholder="Qué te ha gustado, qué te ha sorprendido o cualquier apunte que quieras dejar."
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeDialog} disabled={isPending}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={isPending}>
                {isPending ? "Guardando..." : editingExistingRating ? "Actualizar valoración" : "Guardar valoración"}
              </button>
            </div>
          </form>
        </AccessibleDialog>
      ) : null}
    </>
  );
}
