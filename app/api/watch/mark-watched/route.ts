import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { ensureSameOrigin, sanitizeInternalRedirect } from "@/lib/request-security";
import { markMovieAsWatched } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionResult = await resolveApiSessionUser("watch/mark-watched/session");
  if ("response" in sessionResult) return sessionResult.response;
  const sessionUser = sessionResult.user;
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
    revalidatePath("/");
    revalidatePath("/vistas");
    revalidatePath("/pendientes");
    if (request.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json({ status: "watched" });
    }
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "watch/mark-watched",
      fallbackMessage: "No se pudo marcar la película como vista.",
      defaultStatus: 400
    });
  }
}
