import { NextResponse } from "next/server";

import { ensureSameOrigin } from "@/lib/request-security";
import { resetUserCredentials } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
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
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo restablecer el acceso."
      },
      { status: 400 }
    );
  }
}
