import { NextResponse } from "next/server";

import { addPendingMovie } from "@/lib/store";
import { Movie } from "@/lib/types";

export async function POST(request: Request) {
  const movie = (await request.json()) as Movie;

  if (!movie?.title) {
    return NextResponse.json({ error: "Pel\u00edcula inv\u00e1lida." }, { status: 400 });
  }

  const result = await addPendingMovie(movie);
  return NextResponse.json(result);
}
