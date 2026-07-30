import { NextResponse } from "next/server";

import { resolveApiSessionUser } from "@/lib/api-session";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { ensureSameOrigin } from "@/lib/request-security";
import { generateBatch } from "@/lib/store";

export async function POST(request: Request) {
  const originError = ensureSameOrigin(request);
  if (originError) {
    return originError;
  }

  const sessionResult = await resolveApiSessionUser("weekly-recommendations/generate/session");
  if ("response" in sessionResult) return sessionResult.response;
  const sessionUser = sessionResult.user;
  if (!sessionUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  try {
    await generateBatch();
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "weekly-recommendations/generate",
      fallbackMessage: "No se pudo generar una nueva tanda."
    });
  }
}
