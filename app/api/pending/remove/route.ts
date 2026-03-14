import { NextResponse } from "next/server";

import { removePendingMovie } from "@/lib/store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const movieId = String(formData.get("movieId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/pendientes");

  if (!movieId) {
    return NextResponse.json({ error: "Película inválida." }, { status: 400 });
  }

  try {
    await removePendingMovie(movieId);
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
