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
  const classes = ["user-avatar", `user-avatar-${size}`, className].filter(Boolean).join(" ");

  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt={`Avatar de ${user.name}`} className={classes} />;
  }

  return <span className={classes}>{getInitials(user.name)}</span>;
}
