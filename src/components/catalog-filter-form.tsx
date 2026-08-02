"use client";

import type { FormEvent, InputHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const SEARCH_DEBOUNCE_MS = 240;

type CatalogFilterFormProps = PropsWithChildren<{
  anchorId: string;
  basePath: string;
  className: string;
}>;

type CatalogTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "value"> & {
  value: string;
};

type CatalogClearButtonProps = {
  anchorId: string;
  basePath: string;
  children: ReactNode;
  className: string;
};

export function CatalogTextInput({ value, ...props }: CatalogTextInputProps) {
  const [previousValue, setPreviousValue] = useState(value);
  const [currentValue, setCurrentValue] = useState(value);

  if (previousValue !== value) {
    setPreviousValue(value);
    setCurrentValue(value);
  }

  return <input {...props} value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} />;
}

export function CatalogClearButton({ anchorId, basePath, children, className }: CatalogClearButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={() => router.replace(`${basePath}#${anchorId}`, { scroll: false })}
    >
      {children}
    </button>
  );
}

export function CatalogFilterForm({ anchorId, basePath, children, className }: CatalogFilterFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const navigateWithCurrentFilters = useCallback(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const query = new URLSearchParams();
    for (const [name, rawValue] of new FormData(form).entries()) {
      if (typeof rawValue !== "string") {
        continue;
      }

      const value = rawValue.trim();
      if (value) {
        query.set(name, value);
      }
    }

    const serialized = query.toString();
    const nextUrl = `${basePath}${serialized ? `?${serialized}` : ""}#${anchorId}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl === nextUrl) {
      return;
    }

    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [anchorId, basePath, router]);

  useEffect(() => {
    return () => window.clearTimeout(debounceRef.current);
  }, []);

  const scheduleSearch = () => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(navigateWithCurrentFilters, SEARCH_DEBOUNCE_MS);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.clearTimeout(debounceRef.current);
    navigateWithCurrentFilters();
  };

  return (
    <form
      ref={formRef}
      action={`${basePath}#${anchorId}`}
      method="get"
      className={`${className} ${isPending ? "is-filtering" : ""}`}
      aria-busy={isPending}
      onSubmit={handleSubmit}
      onInput={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type !== "hidden") {
          scheduleSearch();
        }
      }}
    >
      {children}
    </form>
  );
}
