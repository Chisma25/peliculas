import { NextResponse } from "next/server";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { listHistory } from "@/lib/store";

export async function GET(request: Request) {
  const sessionResult = await resolveApiSessionUser("history/list/session");
  if ("response" in sessionResult) return sessionResult.response;
  const sessionUser = sessionResult.user;
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  try {
    const history = await listHistory({
      search: searchParams.get("search") ?? undefined,
      genre: searchParams.get("genre") ?? undefined,
      year: searchParams.get("year") ?? undefined
    }, sessionUser.id);

    return NextResponse.json({ history });
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "history/list",
      fallbackMessage: "No se pudo cargar el historial."
    });
  }
}
