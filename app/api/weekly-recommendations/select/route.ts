import { NextResponse } from "next/server";

import { ensureSameOrigin } from "@/lib/request-security";
import { getSessionUser, selectWeeklyMovie } from "@/lib/store";

export const preferredRegion = "fra1";

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
  const batchId = String(formData.get("batchId") ?? "");
  const movieId = String(formData.get("movieId") ?? "");

  try {
    await selectWeeklyMovie(batchId, movieId);
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo seleccionar la película."
      },
      { status: 400 }
    );
  }
}
