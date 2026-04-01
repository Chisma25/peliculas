import { NextResponse } from "next/server";

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

export function sanitizeInternalRedirect(redirectTo: string | null | undefined, fallbackPath = "/") {
  if (!redirectTo) {
    return fallbackPath;
  }

  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return fallbackPath;
  }

  return redirectTo;
}
