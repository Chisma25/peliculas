import { NextResponse } from "next/server";

import { operationalErrorResponse } from "@/lib/operational-errors";
import { enforceRateLimit, ensureSameOrigin } from "@/lib/request-security";
import { authenticateUser } from "@/lib/store";
import { createSessionToken, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimitError = enforceRateLimit(request, {
    bucket: "auth-login",
    limit: 8,
    windowMs: 10 * 60 * 1000
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  let user;
  try {
    user = await authenticateUser(username, password);
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "auth/login",
      fallbackMessage: "El acceso no está disponible temporalmente."
    });
  }
  if (!user) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  let sessionToken: string;
  try {
    sessionToken = await createSessionToken(user.id);
  } catch {
    return NextResponse.json(
      {
        error: "El acceso no está disponible temporalmente. Falta revisar la configuración de sesión."
      },
      { status: 503 }
    );
  }

  const response = NextResponse.json({
    message: "Sesión iniciada.",
    userId: user.id,
    redirectTo: "/"
  });

  response.cookies.set(getSessionCookieName(), sessionToken, getSessionCookieOptions());

  return response;
}
