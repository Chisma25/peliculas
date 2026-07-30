"use client";

import Link, { LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { AnchorHTMLAttributes, PropsWithChildren } from "react";

type PrefetchLinkProps = PropsWithChildren<
  LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>
>;

export function PrefetchLink({ href, children, onMouseEnter, onFocus, onTouchStart, ...props }: PrefetchLinkProps) {
  const router = useRouter();
  const hrefValue = typeof href === "string" ? href : href.pathname ?? "/";

  const prefetchOnIntent = () => router.prefetch(hrefValue);

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={(event) => {
        prefetchOnIntent();
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        prefetchOnIntent();
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        prefetchOnIntent();
        onTouchStart?.(event);
      }}
    >
      {children}
    </Link>
  );
}
