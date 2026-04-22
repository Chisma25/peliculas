import { NextResponse } from "next/server";

import { enforceRateLimit, ensureSameOrigin } from "@/lib/request-security";
import { getSessionUser, updateUserCredentialsByAdmin } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimitError = enforceRateLimit(request, {
    bucket: "admin-users-update",
    limit: 20,
    windowMs: 10 * 60 * 1000
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const sessionUser = await getSessionUser();
  if (!sessionUser?.isAdmin) {
    return NextResponse.json({ error: "No tienes permisos para gestionar cuentas." }, { status: 403 });
  }

  const formData = await request.formData();
  const userId = String(formData.get("userId") ?? "");
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const user = await updateUserCredentialsByAdmin(sessionUser.id, {
      userId,
      username,
      password
    });

    return NextResponse.json({
      message: `Cuenta actualizada para ${user.name}. Ahora entra con @${user.username}.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo actualizar la cuenta."
      },
      { status: 400 }
    );
  }
}
