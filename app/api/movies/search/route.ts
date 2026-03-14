import { NextResponse } from "next/server";

import { movieSearch } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const results = await movieSearch(query);
  return NextResponse.json({ results });
}
