import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { ensureSameOrigin } from "@/lib/request-security";
import { getSessionUser, addPendingMovie } from "@/lib/store";
import { Movie } from "@/lib/types";

export const preferredRegion = "fra1";

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

  try {
    const result = await addPendingMovie(movie);
    if (result.status === "added") {
      revalidatePath("/");
      revalidatePath("/pendientes");
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[pending/add] Could not add pending movie.", error);
    return NextResponse.json(
      { status: "error", error: "No se pudo guardar la película en pendientes. Prueba otra vez." },
      { status: 500 }
    );
  }
}
