import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionCookieName } from "@/lib/session";
import { getSessionUserFromToken } from "@/lib/store";
import { operationalErrorResponse } from "@/lib/operational-errors";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPage = pathname === "/login" || pathname === "/reset-credenciales";
  const isApiRoute = pathname.startsWith("/api");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isPublicApi = isAuthApi || pathname === "/api/version" || pathname === "/api/health";
  const isNextAsset = pathname.startsWith("/_next");
  const isFile = pathname.startsWith("/brand/") || pathname === "/icon.svg" || pathname === "/favicon.ico";

  if (!isApiRoute && !isNextAsset && !isFile && !["GET", "HEAD"].includes(request.method)) {
    return NextResponse.redirect(new URL(pathname || "/", request.url), 303);
  }

  if (isPublicPage || isPublicApi || isNextAsset || isFile) {
    return NextResponse.next();
  }

  const session = request.cookies.get(getSessionCookieName())?.value;
  try {
    if (await getSessionUserFromToken(session)) {
      return NextResponse.next();
    }
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "proxy/session",
      fallbackMessage: "El acceso no está disponible temporalmente."
    });
  }

  if (isApiRoute) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname);
  }

  return NextResponse.redirect(loginUrl, 303);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
