"use client";

import Link, { LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { AnchorHTMLAttributes, PropsWithChildren, useEffect } from "react";

type PrefetchLinkProps = PropsWithChildren<
  LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>
>;

export function PrefetchLink({ href, children, onMouseEnter, onFocus, ...props }: PrefetchLinkProps) {
  const router = useRouter();
  const hrefValue = typeof href === "string" ? href : href.pathname ?? "/";

  useEffect(() => {
    const prefetch = () => {
      router.prefetch(hrefValue);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(prefetch, 250);
    return () => globalThis.clearTimeout(timeoutId);
  }, [hrefValue, router]);

  return (
    <Link
      {...props}
      href={href}
      prefetch
      onMouseEnter={(event) => {
        router.prefetch(hrefValue);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        router.prefetch(hrefValue);
        onFocus?.(event);
      }}
    >
      {children}
    </Link>
  );
}
