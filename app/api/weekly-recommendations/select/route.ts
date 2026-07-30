import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { ensureSameOrigin } from "@/lib/request-security";
import { selectWeeklyMovie } from "@/lib/store";

export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionResult = await resolveApiSessionUser("weekly-recommendations/select/session");
  if ("response" in sessionResult) return sessionResult.response;
  const sessionUser = sessionResult.user;
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const formData = await request.formData();
  const batchId = String(formData.get("batchId") ?? "");
  const movieId = String(formData.get("movieId") ?? "");

  try {
    await selectWeeklyMovie(batchId, movieId);
    revalidatePath("/");
    revalidatePath("/pendientes");
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "weekly-recommendations/select",
      fallbackMessage: "No se pudo seleccionar la película.",
      defaultStatus: 400
    });
  }
}
