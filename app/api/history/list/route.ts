import { NextResponse } from "next/server";

import { listHistory } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const history = await listHistory({
    search: searchParams.get("search") ?? undefined,
    genre: searchParams.get("genre") ?? undefined,
    year: searchParams.get("year") ?? undefined
  });

  return NextResponse.json({ history });
}
