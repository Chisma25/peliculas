import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { ensureSameOrigin, readJsonBody } from "@/lib/request-security";
import { addPendingMovie } from "@/lib/store";
import { Movie } from "@/lib/types";

export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionResult = await resolveApiSessionUser("pending/add/session");
  if ("response" in sessionResult) return sessionResult.response;
  const sessionUser = sessionResult.user;
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const parsedBody = await readJsonBody<Movie>(request);
  if ("response" in parsedBody) {
    return parsedBody.response;
  }
  const movie = parsedBody.data;

  if (
    !movie ||
    typeof movie !== "object" ||
    typeof movie.title !== "string" ||
    !movie.title.trim() ||
    movie.title.length > 200 ||
    (movie.sourceIds?.tmdb !== undefined && typeof movie.sourceIds.tmdb !== "string")
  ) {
    return NextResponse.json({ error: "Película inválida." }, { status: 400 });
  }

  try {
    const result = await addPendingMovie(movie);
    if (result.status === "added") {
      revalidatePath("/");
      revalidatePath("/pendientes");
    }
    return NextResponse.json(result);
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "pending/add",
      fallbackMessage: "No se pudo guardar la película en pendientes. Prueba otra vez."
    });
  }
}
