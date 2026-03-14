import { NextResponse } from "next/server";

import { markMovieAsWatched } from "@/lib/store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const movieId = String(formData.get("movieId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/");

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
