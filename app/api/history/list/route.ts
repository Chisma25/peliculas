import { NextResponse } from "next/server";

import { getSessionUser, listHistory } from "@/lib/store";

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const history = await listHistory({
    search: searchParams.get("search") ?? undefined,
    genre: searchParams.get("genre") ?? undefined,
    year: searchParams.get("year") ?? undefined
  }, sessionUser.id);

  return NextResponse.json({ history });
}
