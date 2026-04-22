import { NextResponse } from "next/server";

import { enforceRateLimit, ensureSameOrigin } from "@/lib/request-security";
import { resetUserCredentials } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimitError = enforceRateLimit(request, {
    bucket: "auth-reset-credentials",
    limit: 5,
    windowMs: 15 * 60 * 1000
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const formData = await request.formData();
  const adminCode = String(formData.get("adminCode") ?? "");
  const identifier = String(formData.get("identifier") ?? "");
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const user = await resetUserCredentials({
      adminCode,
      identifier,
      username,
      password
    });

    return NextResponse.json({
      message: `Acceso restablecido para ${user.name}. Ahora entra con @${user.username}.`
    });
  } catch {
    return NextResponse.json(
      {
        error: "No se pudo restablecer el acceso con los datos facilitados."
      },
      { status: 400 }
    );
  }
}
