import { NextResponse } from "next/server";

import { ensureSameOrigin } from "@/lib/request-security";
import { generateBatch, getSessionUser } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  await generateBatch();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
