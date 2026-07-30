import { NextResponse } from "next/server";

import { getDeploymentVersion } from "@/lib/deployment-version";
import { logOperationalError } from "@/lib/operational-errors";
import { runOperationalHealthCheck } from "@/lib/operational-health";
import { secureStringMatch } from "@/lib/user-input";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

function responseHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json"
  };
}

export async function GET(request: Request) {
  const configuredSecret = process.env.HEALTHCHECK_SECRET?.trim() ?? "";
  const suppliedSecret =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  if (!configuredSecret || !suppliedSecret || !secureStringMatch(suppliedSecret, configuredSecret)) {
    return NextResponse.json(
      { status: "unauthorized" },
      { status: 401, headers: responseHeaders() }
    );
  }

  try {
    const report = await runOperationalHealthCheck();
    return NextResponse.json(
      {
        service: "cine-semanal",
        status: report.healthy ? "ok" : "degraded",
        checkedAt: new Date().toISOString(),
        deployment: getDeploymentVersion(),
        counts: report.counts,
        issues: report.issues
      },
      { status: report.healthy ? 200 : 503, headers: responseHeaders() }
    );
  } catch (error) {
    const incidentId = logOperationalError("health", error);
    return NextResponse.json(
      {
        service: "cine-semanal",
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        deployment: getDeploymentVersion(),
        incidentId
      },
      { status: 503, headers: responseHeaders() }
    );
  }
}
