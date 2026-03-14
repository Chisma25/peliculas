import { NextResponse } from "next/server";

import { getSessionUser, upsertRating } from "@/lib/store";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesion no valida." }, { status: 401 });
  }

  const formData = await request.formData();
  const movieId = String(formData.get("movieId") ?? "");
  const score = Number.parseFloat(String(formData.get("score") ?? ""));
  const comment = String(formData.get("comment") ?? "");

  if (!movieId || !Number.isFinite(score) || score < 0 || score > 10) {
    return NextResponse.json({ error: "Datos de valoraci\u00f3n inv\u00e1lidos." }, { status: 400 });
  }

  await upsertRating({
    movieId,
    userId: sessionUser.id,
    score,
    comment
  });

  return NextResponse.json({ message: "Valoraci\u00f3n guardada correctamente." });
}
