import { afterEach, describe, expect, it, vi } from "vitest";

import { DataUnavailableError } from "@/lib/data-availability";
import { operationalErrorResponse } from "@/lib/operational-errors";
import { StatePersistenceUnavailableError } from "@/lib/state-persistence";

describe("operational error responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports database read outages as retryable without exposing internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = operationalErrorResponse(new DataUnavailableError("secret database detail"), {
      scope: "test/read",
      fallbackMessage: "fallback"
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    const payload = await response.json();
    expect(payload.error).toContain("temporalmente");
    expect(payload.error).not.toContain("secret database detail");
    expect(payload.incidentId).toBeTypeOf("string");
  });

  it("reports blocked writes as unavailable instead of validation failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = operationalErrorResponse(
      new StatePersistenceUnavailableError("Database writes are temporarily unavailable."),
      {
        scope: "test/write",
        fallbackMessage: "fallback",
        defaultStatus: 400
      }
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("No se ha guardado ningún cambio");
  });
});
