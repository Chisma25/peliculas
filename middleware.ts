import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionCookieName, verifySessionToken } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPage = pathname === "/login";
  const isApiRoute = pathname.startsWith("/api");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isNextAsset = pathname.startsWith("/_next");
  const isFile = /\.[^/]+$/.test(pathname);

  if (!isApiRoute && !isNextAsset && !isFile && !["GET", "HEAD"].includes(request.method)) {
    return NextResponse.redirect(new URL(pathname || "/", request.url), 303);
  }

  if (isPublicPage || isAuthApi || isNextAsset || isFile) {
    return NextResponse.next();
  }

  const session = request.cookies.get(getSessionCookieName())?.value;
  const userId = await verifySessionToken(session);
  if (userId) {
    return NextResponse.next();
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
