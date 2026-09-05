import { cookies } from "next/headers";
import { cache } from "react";
import type { User } from "@/lib/types";
import { getSessionCookieName as getSessionCookieNameFromSession, verifySessionToken } from "@/lib/session";
import { normalizeIdentity, normalizeUsername, verifyPassword } from "@/lib/user-input";

// The injected loader MUST read current credentials, without a process cache.
// Only the cookie-based convenience function is memoized within a request.
export function createAuthenticationService(loadUsersForAuthentication: () => Promise<User[]>) {
  function getSessionCookieName() {
    return getSessionCookieNameFromSession();
  }

  async function getSessionUserFromToken(token?: string | null) {
    const userId = await verifySessionToken(token);
    if (!userId) {
      return null;
    }

    // Proxy and route handlers can run in separate processes. Never authorize
    // using a process cache that can outlive a password change in another process.
    const users = await loadUsersForAuthentication();
    const user = users.find((user) => user.id === userId);
    if (!user || !(await verifySessionToken(token, user.passwordHash))) {
      return null;
    }
    return user;
  }

  const getSessionUserForRequest = cache(async () => {
    const cookieStore = await cookies();
    return getSessionUserFromToken(cookieStore.get(getSessionCookieNameFromSession())?.value);
  });

  async function getSessionUser() {
    return getSessionUserForRequest();
  }

  async function authenticateUser(username: string, password: string) {
    const users = await loadUsersForAuthentication();
    const normalizedIdentifier = normalizeUsername(username);
    const user =
      users.find(
        (entry) =>
          normalizeUsername(entry.username) === normalizedIdentifier ||
          normalizeIdentity(entry.name) === normalizedIdentifier
      ) ?? null;
    if (!user) {
      return null;
    }

    return verifyPassword(password, user.passwordHash) ? user : null;
  }

  return { getSessionCookieName, getSessionUserFromToken, getSessionUser, authenticateUser };
}
