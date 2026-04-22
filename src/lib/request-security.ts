import { NextResponse } from "next/server";

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX_ENTRIES = 5000;

function getRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function getClientAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) {
    return forwardedFor;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (connectingIp) {
    return connectingIp;
  }

  return "unknown-client";
}

function pruneRateLimitStore(now: number) {
  for (const [key, value] of rateLimitStore) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }

  if (rateLimitStore.size <= RATE_LIMIT_MAX_ENTRIES) {
    return;
  }

  const overflow = rateLimitStore.size - RATE_LIMIT_MAX_ENTRIES;
  const oldestEntries = [...rateLimitStore.entries()]
    .sort((left, right) => left[1].resetAt - right[1].resetAt)
    .slice(0, overflow);

  for (const [key] of oldestEntries) {
    rateLimitStore.delete(key);
  }
}

export function ensureSameOrigin(request: Request) {
  const origin = getRequestOrigin(request);
  if (!origin) {
    return null;
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    if (origin !== requestOrigin) {
      return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "No se pudo validar el origen." }, { status: 400 });
  }

  return null;
}

export function enforceRateLimit(
  request: Request,
  options: {
    bucket: string;
    limit: number;
    windowMs: number;
    errorMessage?: string;
  }
) {
  const now = Date.now();
  pruneRateLimitStore(now);

  const key = `${options.bucket}:${getClientAddress(request)}`;
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + options.windowMs
    });
    return null;
  }

  if (current.count >= options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      {
        error: options.errorMessage ?? "Demasiados intentos. Espera un poco antes de volver a probar."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds)
        }
      }
    );
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return null;
}

export function sanitizeInternalRedirect(redirectTo: string | null | undefined, fallbackPath = "/") {
  if (!redirectTo) {
    return fallbackPath;
  }

  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return fallbackPath;
  }

  return redirectTo;
}
