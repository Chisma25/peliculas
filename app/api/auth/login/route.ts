import { NextResponse } from "next/server";

import { ensureSameOrigin } from "@/lib/request-security";
import { authenticateUser } from "@/lib/store";
import { createSessionToken, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticateUser(username, password);
  if (!user) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const sessionToken = await createSessionToken(user.id);
  const response = NextResponse.json({
    message: "Sesión iniciada.",
    userId: user.id
  });

  response.cookies.set(getSessionCookieName(), sessionToken, getSessionCookieOptions());

  return response;
}
