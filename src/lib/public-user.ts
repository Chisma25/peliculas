import type { User } from "@/lib/types";
import { getAvatarDeliveryUrl } from "@/lib/avatar-data";

export type PublicUser = Pick<User, "id" | "name" | "username" | "avatarSeed" | "avatarUrl" | "isAdmin">;

// Explicit projection: TypeScript's Pick alone does not strip fields at runtime.
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarSeed: user.avatarSeed,
    avatarUrl: user.avatarUrl?.startsWith("data:") ? getAvatarDeliveryUrl(user.id, user.avatarUrl) : user.avatarUrl,
    isAdmin: user.isAdmin === true
  };
}
