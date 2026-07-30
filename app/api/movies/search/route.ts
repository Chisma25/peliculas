import { NextResponse } from "next/server";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { movieSearch } from "@/lib/store";

export const preferredRegion = "fra1";

export async function GET(request: Request) {
  const sessionResult = await resolveApiSessionUser("movies/search/session");
  if ("response" in sessionResult) return sessionResult.response;
  const sessionUser = sessionResult.user;
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (query.length > 120) {
    return NextResponse.json({ error: "La búsqueda es demasiado larga." }, { status: 400 });
  }

  try {
    const results = await movieSearch(query);
    return NextResponse.json({ results });
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "movies/search",
      fallbackMessage: "No se pudo completar la búsqueda."
    });
  }
}
