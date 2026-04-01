import { NextResponse } from "next/server";

import { ensureSameOrigin } from "@/lib/request-security";
import { getSessionUser, addPendingMovie } from "@/lib/store";
import { Movie } from "@/lib/types";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const movie = (await request.json()) as Movie;

  if (!movie?.title || movie.title.length > 200) {
    return NextResponse.json({ error: "Película inválida." }, { status: 400 });
  }

  const result = await addPendingMovie(movie);
  return NextResponse.json(result);
}
