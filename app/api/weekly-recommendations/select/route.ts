import { NextResponse } from "next/server";

import { selectWeeklyMovie } from "@/lib/store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const batchId = String(formData.get("batchId") ?? "");
  const movieId = String(formData.get("movieId") ?? "");

  try {
    await selectWeeklyMovie(batchId, movieId);
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo seleccionar la pel\u00edcula."
      },
      { status: 400 }
    );
  }
}
