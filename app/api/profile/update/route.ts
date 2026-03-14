import { NextResponse } from "next/server";

import { getSessionUser, updateUserProfile } from "@/lib/store";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesion no valida." }, { status: 401 });
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const user = await updateUserProfile(sessionUser.id, {
      name,
      username,
      password
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
