import type { Prisma } from "@prisma/client";
import type { User } from "@/lib/types";
import { getAvatarDeliveryUrl } from "@/lib/avatar-data";
import { slugify } from "@/lib/utils";

// Database representation and writes. Transaction clients are supplied by the
// caller; this module never opens a nested transaction for normal mutations.
export const USER_RECORD_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  avatarSeed: true,
  passwordHash: true,
  isAdmin: true
} as const;

export const USER_RECORD_WITH_AVATAR_SELECT = {
  ...USER_RECORD_SELECT,
  avatarUrl: true
} as const;

export async function readUsersFromDatabase(options: { includeAvatarUrls?: boolean } = {}) {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.userRecord.findMany({
    select: options.includeAvatarUrls ? USER_RECORD_WITH_AVATAR_SELECT : USER_RECORD_SELECT,
    orderBy: { name: "asc" }
  });
  return mapUserRecordsToStateUsers(rows);
}

export function ensureUserCredentials(user: User) {
  const username = user.username?.trim() || user.name || user.email.split("@")[0] || user.id;
  const passwordHash = typeof user.passwordHash === "string" ? user.passwordHash.trim() : "";
  return {
    ...user,
    username,
    avatarSeed: user.avatarSeed || slugify(user.name || username),
    // Legacy accounts without password hash stay blocked until an admin or emergency reset assigns one.
    passwordHash,
    isAdmin: user.isAdmin === true
  };
}

export function mapUserRecordsToStateUsers(records: Array<{
  id: string;
  name: string;
  username: string;
  email: string;
  avatarSeed: string | null;
  avatarUrl?: string | null;
  passwordHash: string;
  isAdmin: boolean;
}>, options: { useDeliveryUrls?: boolean } = {}): User[] {
  const useDeliveryUrls = options.useDeliveryUrls ?? true;
  return records.map((entry) => {
    const user: User = {
      id: entry.id,
      name: entry.name,
      username: entry.username,
      email: entry.email,
      avatarSeed: entry.avatarSeed ?? slugify(entry.name || entry.username),
      passwordHash: entry.passwordHash,
      isAdmin: entry.isAdmin
    };

    if (entry.avatarUrl) {
      user.avatarUrl = useDeliveryUrls ? getAvatarDeliveryUrl(entry.id, entry.avatarUrl) : entry.avatarUrl;
    }

    return ensureUserCredentials(user);
  });
}

export async function syncUsersToDatabase(users: User[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction(
    users.map((user) =>
      prisma.userRecord.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          avatarSeed: user.avatarSeed ?? null,
          avatarUrl: user.avatarUrl ?? null,
          passwordHash: user.passwordHash,
          isAdmin: Boolean(user.isAdmin)
        },
        update: {
          name: user.name,
          username: user.username,
          email: user.email,
          avatarSeed: user.avatarSeed ?? null,
          avatarUrl: user.avatarUrl ?? null,
          passwordHash: user.passwordHash,
          isAdmin: Boolean(user.isAdmin)
        }
      })
    )
  );
}

export async function upsertUserToDatabase(user: User, client?: Prisma.TransactionClient) {
  const database = client ?? (await import("@/lib/prisma")).prisma;
  await database.userRecord.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatarSeed: user.avatarSeed ?? null,
      avatarUrl: user.avatarUrl ?? null,
      passwordHash: user.passwordHash,
      isAdmin: Boolean(user.isAdmin)
    },
    update: {
      name: user.name,
      username: user.username,
      email: user.email,
      avatarSeed: user.avatarSeed ?? null,
      avatarUrl: user.avatarUrl ?? null,
      passwordHash: user.passwordHash,
      isAdmin: Boolean(user.isAdmin)
    }
  });
}
