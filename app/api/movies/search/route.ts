import { NextResponse } from "next/server";

import { getSessionUser, movieSearch } from "@/lib/store";

export const preferredRegion = "fra1";

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (query.length > 120) {
    return NextResponse.json({ error: "La búsqueda es demasiado larga." }, { status: 400 });
  }

  const results = await movieSearch(query);
  return NextResponse.json({ results });
}
