import { NextResponse } from "next/server";

import { ensureSameOrigin, sanitizeInternalRedirect } from "@/lib/request-security";
import { getSessionUser, markMovieAsWatched } from "@/lib/store";

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
  const redirectTo = sanitizeInternalRedirect(String(formData.get("redirectTo") ?? "/"), "/");

  if (!movieId) {
    return NextResponse.json({ error: "Falta la pelicula." }, { status: 400 });
  }

  try {
    await markMovieAsWatched(movieId);
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo marcar la pelicula como vista."
      },
      { status: 400 }
    );
  }
}
