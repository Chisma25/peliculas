const SESSION_COOKIE = "cine.session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEV_SESSION_SECRET = "cine-semanal-dev-session-secret";
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;

const textEncoder = new TextEncoder();

function getSessionSecret(options?: { requireConfiguredSecret?: boolean }) {
  const configuredSecret = process.env.SESSION_SECRET?.trim();
  if (configuredSecret) {
    if (process.env.NODE_ENV === "production" && configuredSecret.length < MINIMUM_PRODUCTION_SECRET_LENGTH) {
      if (options?.requireConfiguredSecret) {
        throw new Error("SESSION_SECRET debe tener al menos 32 caracteres en producción.");
      }

      return null;
    }

    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    if (options?.requireConfiguredSecret) {
      throw new Error("SESSION_SECRET es obligatorio en producción.");
    }

    return null;
  }

  return DEV_SESSION_SECRET;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function signValue(value: string, options?: { requireConfiguredSecret?: boolean }) {
  const secret = getSessionSecret(options);
  if (!secret) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function getSessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

async function credentialTag(userId: string, passwordHash: string) {
  return signValue(`credentials:${userId}:${passwordHash}`);
}

export async function createSessionToken(userId: string, passwordHash: string) {
  if (!passwordHash) {
    throw new Error("La cuenta no tiene credenciales activas.");
  }
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const encodedUserId = encodeURIComponent(userId).replace(/\./g, "%2E");
  const tag = await credentialTag(userId, passwordHash);
  const payload = `v2.${encodedUserId}.${expiresAt}.${tag}`;
  const signature = await signValue(payload, { requireConfiguredSecret: true });
  if (!signature) {
    throw new Error("No se pudo firmar la sesión.");
  }

  return `${payload}.${signature}`;
}

// Without passwordHash this only checks the signed envelope. Authorization must
// also pass the current server-side hash, so password changes revoke old tokens.
export async function verifySessionToken(token?: string | null, passwordHash?: string) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  const [version, encodedUserId, expiresAtRaw, tag, signature] = parts;
  if (parts.length !== 5 || version !== "v2" || !encodedUserId || !/^\d+$/.test(expiresAtRaw) ||
      !/^[a-f0-9]{64}$/.test(tag) || !/^[a-f0-9]{64}$/.test(signature)) {
    return null;
  }

  const payload = `${version}.${encodedUserId}.${expiresAtRaw}.${tag}`;
  const expected = await signValue(payload);
  if (!expected) {
    return null;
  }

  if (!constantTimeEqual(signature, expected)) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  try {
    const userId = decodeURIComponent(encodedUserId);
    if (passwordHash !== undefined) {
      if (!passwordHash) return null;
      const currentTag = await credentialTag(userId, passwordHash);
      if (!currentTag || !constantTimeEqual(tag, currentTag)) return null;
    }
    return userId;
  } catch {
    return null;
  }
}
