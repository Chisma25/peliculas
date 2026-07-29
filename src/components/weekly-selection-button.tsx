"use client";

import { useFormStatus } from "react-dom";

type WeeklySelectionButtonProps = {
  compact?: boolean;
  selected?: boolean;
};

export function WeeklySelectionButton({ compact = false, selected = false }: WeeklySelectionButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = selected || pending;
  const label = pending
    ? "Eligiendo..."
    : selected
      ? compact
        ? "Elegida"
        : "Elegida esta semana"
      : compact
        ? "Elegir"
        : "Elegir para esta semana";

  return (
    <button
      type="submit"
      className="primary-button weekly-selection-button"
      disabled={isDisabled}
      aria-disabled={isDisabled}
    >
      {label}
    </button>
  );
}
