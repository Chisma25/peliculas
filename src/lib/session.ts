const SESSION_COOKIE = "cine.session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEV_SESSION_SECRET = "cine-semanal-dev-session-secret";
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;

const textEncoder = new TextEncoder();

function getSessionSecret() {
  const configuredSecret = process.env.SESSION_SECRET?.trim();
  if (configuredSecret) {
    if (process.env.NODE_ENV === "production" && configuredSecret.length < MINIMUM_PRODUCTION_SECRET_LENGTH) {
      throw new Error("SESSION_SECRET debe tener al menos 32 caracteres en producción.");
    }

    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET es obligatorio en producción.");
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

async function signValue(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getSessionSecret()),
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

export async function createSessionToken(userId: string) {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const encodedUserId = encodeURIComponent(userId);
  const payload = `${encodedUserId}.${expiresAt}`;
  const signature = await signValue(payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token?: string | null) {
  if (!token) {
    return null;
  }

  const [encodedUserId, expiresAtRaw, signature] = token.split(".");
  if (!encodedUserId || !expiresAtRaw || !signature) {
    return null;
  }

  const payload = `${encodedUserId}.${expiresAtRaw}`;
  const expected = await signValue(payload);
  if (!constantTimeEqual(signature, expected)) {
    return null;
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  try {
    return decodeURIComponent(encodedUserId);
  } catch {
    return null;
  }
}
