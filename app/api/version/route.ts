import { NextResponse } from "next/server";

import { getDeploymentVersion } from "@/lib/deployment-version";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      service: "cine-semanal",
      status: "ok",
      ...getDeploymentVersion()
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
