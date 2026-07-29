"use client";

import { useFormStatus } from "react-dom";

type WeeklySelectionButtonProps = {
  selected?: boolean;
};

export function WeeklySelectionButton({ selected = false }: WeeklySelectionButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = selected || pending;

  return (
    <button
      type="submit"
      className="primary-button weekly-selection-button"
      disabled={isDisabled}
      aria-disabled={isDisabled}
    >
      {pending ? "Eligiendo..." : selected ? "Elegida esta semana" : "Elegir para esta semana"}
    </button>
  );
}
