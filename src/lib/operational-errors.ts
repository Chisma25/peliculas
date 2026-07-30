import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { DataUnavailableError } from "@/lib/data-availability";

type OperationalErrorOptions = {
  scope: string;
  fallbackMessage: string;
  defaultStatus?: number;
};

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: "UnknownError",
    message: String(error)
  };
}

export function logOperationalError(scope: string, error: unknown, incidentId = randomUUID()) {
  console.error(
    JSON.stringify({
      event: "operational_error",
      scope,
      incidentId,
      ...describeError(error)
    })
  );

  return incidentId;
}

export function operationalErrorResponse(error: unknown, options: OperationalErrorOptions) {
  const unavailable =
    error instanceof DataUnavailableError ||
    (error instanceof Error && error.name === "StatePersistenceUnavailableError");
  const status = unavailable ? 503 : (options.defaultStatus ?? 500);
  if (status < 500) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : options.fallbackMessage
      },
      { status }
    );
  }

  const incidentId = logOperationalError(options.scope, error);

  return NextResponse.json(
    {
      error: unavailable
        ? "Los datos no están disponibles temporalmente. No se ha guardado ningún cambio."
        : options.fallbackMessage,
      incidentId
    },
    {
      status,
      headers: unavailable
        ? {
            "Retry-After": "30"
          }
        : undefined
    }
  );
}
