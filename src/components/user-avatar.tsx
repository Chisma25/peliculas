"use client";

import { useState } from "react";

import { User } from "@/lib/types";

type UserAvatarProps = {
  user: Pick<User, "name" | "avatarUrl">;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

export function UserAvatar({ user, size = "md", className = "" }: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const classes = ["user-avatar", `user-avatar-${size}`, className].filter(Boolean).join(" ");

  if (user.avatarUrl && !imageFailed) {
    return (
      // The authenticated avatar endpoint is intentionally loaded by the browser rather than Next's server-side image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={(image) => {
          if (image?.complete && image.naturalWidth === 0) {
            setImageFailed(true);
          }
        }}
        src={user.avatarUrl}
        alt={`Avatar de ${user.name}`}
        className={classes}
        width={86}
        height={86}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return <span className={classes}>{getInitials(user.name)}</span>;
}
