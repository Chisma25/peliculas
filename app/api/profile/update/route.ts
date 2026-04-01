import { NextResponse } from "next/server";

import { ensureSameOrigin } from "@/lib/request-security";
import { getSessionUser, updateUserProfile } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesion no valida." }, { status: 401 });
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const avatarAction = String(formData.get("avatarAction") ?? "keep");
  const avatarDataUrl = String(formData.get("avatarDataUrl") ?? "");

  try {
    const user = await updateUserProfile(sessionUser.id, {
      name,
      username,
      password,
      avatarAction: avatarAction === "remove" ? "remove" : avatarAction === "replace" ? "replace" : "keep",
      avatarDataUrl
    });

    return NextResponse.json({
      message: `Perfil actualizado. Ahora entras como ${user.username}.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo actualizar el perfil."
      },
      { status: 400 }
    );
  }
}
