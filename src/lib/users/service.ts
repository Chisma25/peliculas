import type { ActivityItem, AppState, User } from "@/lib/types";
import type { StateMutationRunner } from "@/lib/state-persistence";
import { upsertUserToDatabase } from "@/lib/users/records";
import { hashPassword, normalizeUsername, sanitizeAvatarDataUrl, secureStringMatch, validateDisplayName, validatePassword, validateUsername } from "@/lib/user-input";
import { slugify } from "@/lib/utils";

const ADMIN_RESET_CODE = process.env.ADMIN_RESET_CODE?.trim() || "";

type UserServiceDependencies = {
  mutateState: StateMutationRunner;
  findUserById: (state: AppState, id?: string | null) => User | null;
  findUserByIdentity: (state: AppState, identifier?: string | null) => User | null;
  addActivity: (state: AppState, entry: ActivityItem) => void;
  invalidateDerivedCaches: (state: AppState) => void;
};

// Validation and account changes run inside the shared mutation coordinator.
// Keeping these dependencies explicit prevents a circular import of the store.
export function createUserService({ mutateState, findUserById, findUserByIdentity, addActivity, invalidateDerivedCaches }: UserServiceDependencies) {
  async function updateUserProfile(
    userId: string,
    input: {
      name: string;
      username: string;
      password?: string;
      avatarAction?: "keep" | "replace" | "remove";
      avatarDataUrl?: string;
    }
  ) {
    return mutateState(async (state, persistStateChange) => {
      const user = findUserById(state, userId);
      if (!user) {
        throw new Error("No se encontró el usuario.");
      }

      const nextName = input.name.trim();
      const nextUsername = input.username.trim();
      if (!nextName) {
        throw new Error("El nombre visible es obligatorio.");
      }
      if (!nextUsername) {
        throw new Error("El usuario es obligatorio.");
      }
      validateDisplayName(nextName);
      validateUsername(nextUsername);

      const usernameTaken = state.users.some(
        (entry) => entry.id !== userId && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
      );
      if (usernameTaken) {
        throw new Error("Ese usuario ya lo está usando otra persona.");
      }

      const previousName = user.name;
      user.name = nextName;
      user.username = nextUsername;
      user.avatarSeed = slugify(nextName);
      if (input.avatarAction === "remove") {
        user.avatarUrl = undefined;
      } else if (input.avatarAction === "replace") {
        const nextAvatar = sanitizeAvatarDataUrl(input.avatarDataUrl);
        if (!nextAvatar) {
          throw new Error("No se recibió la nueva imagen del avatar.");
        }
        user.avatarUrl = nextAvatar;
      }
      if (input.password?.trim()) {
        validatePassword(input.password.trim());
        user.passwordHash = hashPassword(input.password.trim());
      }

      addActivity(state, {
        type: "rated",
        label: previousName === nextName ? `${nextName} actualizó su perfil` : `${previousName} ahora aparece como ${nextName}`,
        userId: user.id,
        date: new Date().toISOString()
      });

      invalidateDerivedCaches(state);
      await persistStateChange(
        state,
        [
          {
            run: (client) => upsertUserToDatabase(user, client)
          }
        ]
      );
      return user;
    });
  }

  async function updateUserCredentialsByAdmin(
    adminUserId: string,
    input: {
      userId: string;
      username: string;
      password?: string;
    }
  ) {
    return mutateState(async (state, persistStateChange) => {
      const adminUser = findUserById(state, adminUserId);
      if (!adminUser?.isAdmin) {
        throw new Error("No tienes permisos para gestionar cuentas del grupo.");
      }

      const targetUser = findUserById(state, input.userId);
      if (!targetUser) {
        throw new Error("No se encontró la cuenta que quieres editar.");
      }

      const nextUsername = input.username.trim();
      const nextPassword = input.password?.trim() ?? "";

      if (!nextUsername) {
        throw new Error("El usuario no puede quedar vacío.");
      }
      validateUsername(nextUsername);

      const usernameTaken = state.users.some(
        (entry) => entry.id !== targetUser.id && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
      );
      if (usernameTaken) {
        throw new Error("Ese usuario ya lo está usando otra persona.");
      }

      const previousUsername = targetUser.username;
      targetUser.username = nextUsername;

      if (nextPassword) {
        validatePassword(nextPassword);
        targetUser.passwordHash = hashPassword(nextPassword);
      }

      addActivity(state, {
        type: "rated",
        label:
          previousUsername === nextUsername
            ? `${adminUser.name} actualizó el acceso de ${targetUser.name}`
            : `${adminUser.name} cambió el usuario de ${targetUser.name} a @${nextUsername}`,
        userId: targetUser.id,
        date: new Date().toISOString()
      });

      invalidateDerivedCaches(state);
      await persistStateChange(
        state,
        [
          {
            run: (client) => upsertUserToDatabase(targetUser, client)
          }
        ]
      );

      return {
        id: targetUser.id,
        name: targetUser.name,
        username: targetUser.username
      };
    });
  }

  async function resetUserCredentials(input: {
    adminCode: string;
    identifier: string;
    username: string;
    password: string;
  }) {
    if (!ADMIN_RESET_CODE) {
      throw new Error("El reset no esta disponible todavía. Falta configurar ADMIN_RESET_CODE.");
    }

    if (!secureStringMatch(input.adminCode.trim(), ADMIN_RESET_CODE)) {
      throw new Error("El codigo de administración no es valido.");
    }

    return mutateState(async (state, persistStateChange) => {
      const user = findUserByIdentity(state, input.identifier);
      if (!user) {
        throw new Error("No se encontró ninguna cuenta con ese usuario o nombre visible.");
      }

      const nextUsername = input.username.trim();
      const nextPassword = input.password.trim();

      if (!nextUsername) {
        throw new Error("El nuevo usuario es obligatorio.");
      }

      if (!nextPassword) {
        throw new Error("La nueva contraseña es obligatoria.");
      }
      validateUsername(nextUsername);
      validatePassword(nextPassword);

      const usernameTaken = state.users.some(
        (entry) => entry.id !== user.id && normalizeUsername(entry.username) === normalizeUsername(nextUsername)
      );
      if (usernameTaken) {
        throw new Error("Ese usuario ya lo está usando otra persona.");
      }

      user.username = nextUsername;
      user.passwordHash = hashPassword(nextPassword);

      addActivity(state, {
        type: "rated",
        label: `Se restableció el acceso de ${user.name}`,
        userId: user.id,
        date: new Date().toISOString()
      });

      invalidateDerivedCaches(state);
      await persistStateChange(
        state,
        [
          {
            run: (client) => upsertUserToDatabase(user, client)
          }
        ]
      );

      return {
        id: user.id,
        name: user.name,
        username: user.username
      };
    });
  }

  return { updateUserProfile, updateUserCredentialsByAdmin, resetUserCredentials };
}
