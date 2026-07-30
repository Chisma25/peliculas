import { NextResponse } from "next/server";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { ensureSameOrigin } from "@/lib/request-security";
import { upsertRating } from "@/lib/store";
import { isQuarterPointScore } from "@/lib/utils";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionResult = await resolveApiSessionUser("ratings/create-or-update/session");
  if ("response" in sessionResult) return sessionResult.response;
  const sessionUser = sessionResult.user;
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesion no valida." }, { status: 401 });
  }

  const formData = await request.formData();
  const movieId = String(formData.get("movieId") ?? "");
  const score = Number.parseFloat(String(formData.get("score") ?? ""));
  const comment = String(formData.get("comment") ?? "");

  if (
    !movieId ||
    !isQuarterPointScore(score)
  ) {
    return NextResponse.json(
      { error: "La nota debe estar entre 0 y 10 y avanzar en incrementos de 0,25." },
      { status: 400 }
    );
  }

  try {
    await upsertRating({
      movieId,
      userId: sessionUser.id,
      score,
      comment
    });
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "ratings/create-or-update",
      fallbackMessage: "No se pudo guardar la valoración.",
      defaultStatus: 400
    });
  }

  return NextResponse.json({ message: "Valoraci\u00f3n guardada correctamente." });
}
