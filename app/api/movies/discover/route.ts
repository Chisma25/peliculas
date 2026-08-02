import { NextResponse } from "next/server";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { getMovieDiscoverySuggestions } from "@/lib/store";

export const preferredRegion = "fra1";

function parseGeneration(value: string | null) {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 50)) : 0;
}

function parseExcludedTmdbIds(value: string | null) {
  return [...new Set((value ?? "").split(",").filter((item) => /^\d+$/.test(item)))].slice(0, 30);
}

export async function GET(request: Request) {
  const sessionResult = await resolveApiSessionUser("movies/discover/session");
  if ("response" in sessionResult) return sessionResult.response;
  if (!sessionResult.user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const generation = parseGeneration(searchParams.get("generation"));
  const excludeTmdbIds = parseExcludedTmdbIds(searchParams.get("exclude"));

  try {
    const results = await getMovieDiscoverySuggestions({ generation, excludeTmdbIds });
    return NextResponse.json(
      { generation, results },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "movies/discover",
      fallbackMessage: "No se pudo preparar una selección ahora mismo."
    });
  }
}
