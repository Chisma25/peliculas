import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { ensureSameOrigin, sanitizeInternalRedirect } from "@/lib/request-security";
import { getSessionUser, removePendingMovie } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const formData = await request.formData();
  const movieId = String(formData.get("movieId") ?? "");
  const redirectTo = sanitizeInternalRedirect(String(formData.get("redirectTo") ?? "/pendientes"), "/pendientes");

  if (!movieId) {
    return NextResponse.json({ error: "Película inválida." }, { status: 400 });
  }

  try {
    await removePendingMovie(movieId);
    revalidatePath("/");
    revalidatePath("/pendientes");
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo quitar la película de pendientes."
      },
      { status: 400 }
    );
  }
}
