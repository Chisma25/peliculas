import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { ensureSameOrigin, sanitizeInternalRedirect } from "@/lib/request-security";
import { removePendingMovie } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionResult = await resolveApiSessionUser("pending/remove/session");
  if ("response" in sessionResult) return sessionResult.response;
  const sessionUser = sessionResult.user;
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
    return operationalErrorResponse(error, {
      scope: "pending/remove",
      fallbackMessage: "No se pudo quitar la película de pendientes.",
      defaultStatus: 400
    });
  }
}
