import { NextResponse } from "next/server";

import { parseAvatarDataUrl } from "@/lib/avatar-data";
import { optimizeAvatarImage } from "@/lib/avatar-image";
import { operationalErrorResponse } from "@/lib/operational-errors";

type AvatarRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, { params }: AvatarRouteProps) {
  const { id } = await params;
  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.userRecord.findUnique({
      where: { id },
      select: { avatarUrl: true, updatedAt: true }
    });
    const avatar = parseAvatarDataUrl(user?.avatarUrl);

    if (!avatar) {
      return NextResponse.json({ error: "Avatar no encontrado." }, { status: 404 });
    }

    const optimizedAvatar = await optimizeAvatarImage(avatar.bytes);
    const body = optimizedAvatar.bytes.slice().buffer as ArrayBuffer;

    const isVersioned = new URL(request.url).searchParams.has("v");

    return new Response(body, {
      headers: {
        "Cache-Control": isVersioned ? "private, max-age=31536000, immutable" : "private, no-store",
        "Content-Length": String(optimizedAvatar.bytes.byteLength),
        "Content-Type": optimizedAvatar.contentType,
        "Last-Modified": user?.updatedAt.toUTCString() ?? new Date().toUTCString(),
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return operationalErrorResponse(error, {
      scope: "users/avatar",
      fallbackMessage: "No se pudo cargar el avatar."
    });
  }
}
