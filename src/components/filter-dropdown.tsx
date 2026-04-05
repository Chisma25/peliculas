"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FilterDropdownOption = {
  value: string;
  label: string;
};

type FilterDropdownProps = {
  name: string;
  value: string;
  options: FilterDropdownOption[];
  placeholder: string;
  ariaLabel: string;
};

export function FilterDropdown({ name, value, options, placeholder, ariaLabel }: FilterDropdownProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selectedLabel = useMemo(() => {
    return options.find((option) => option.value === selectedValue)?.label ?? placeholder;
  }, [options, placeholder, selectedValue]);

  return (
    <div className={`filter-dropdown ${open ? "filter-dropdown-open" : ""}`} ref={rootRef}>
      <input type="hidden" name={name} value={selectedValue} />
      <button
        type="button"
        className="filter-dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`filter-dropdown-trigger-label ${selectedValue ? "is-selected" : ""}`}>{selectedLabel}</span>
        <span className="filter-dropdown-trigger-icon" aria-hidden="true" />
      </button>

      {open ? (
        <div className="filter-dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const isActive = option.value === selectedValue;

            return (
              <button
                key={`${name}-${option.value || "all"}`}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`filter-dropdown-option ${isActive ? "filter-dropdown-option-active" : ""}`}
                onClick={() => {
                  setSelectedValue(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {isActive ? <span className="filter-dropdown-option-check">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
