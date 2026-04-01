import { NextResponse } from "next/server";

import { ensureSameOrigin } from "@/lib/request-security";
import { getSessionCookieName, getSessionCookieOptions } from "@/lib/session";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(getSessionCookieName(), "", {
    ...getSessionCookieOptions(),
    maxAge: 0
  });
  return response;
}
