import { NextResponse } from "next/server";

import { parseAvatarDataUrl } from "@/lib/avatar-data";

type AvatarRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: AvatarRouteProps) {
  const { id } = await params;
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.userRecord.findUnique({
    where: { id },
    select: { avatarUrl: true, updatedAt: true }
  });
  const avatar = parseAvatarDataUrl(user?.avatarUrl);

  if (!avatar) {
    return NextResponse.json({ error: "Avatar no encontrado." }, { status: 404 });
  }

  const body = avatar.bytes.slice().buffer as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      "Content-Length": String(avatar.bytes.byteLength),
      "Content-Type": avatar.contentType,
      "Last-Modified": user?.updatedAt.toUTCString() ?? new Date().toUTCString(),
      "X-Content-Type-Options": "nosniff"
    }
  });
}
