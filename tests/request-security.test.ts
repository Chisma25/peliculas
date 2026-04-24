import { describe, expect, it } from "vitest";

import { ensureSameOrigin } from "@/lib/request-security";

describe("ensureSameOrigin", () => {
  it("allows equivalent loopback hosts outside production", () => {
    const request = new Request("http://127.0.0.1:3001/api/auth/login", {
      headers: {
        origin: "http://localhost:3001"
      },
      method: "POST"
    });

    expect(ensureSameOrigin(request)).toBeNull();
  });

  it("allows Next dev's wildcard hostname for local requests", () => {
    const request = new Request("http://0.0.0.0:3001/api/auth/login", {
      headers: {
        origin: "http://localhost:3001"
      },
      method: "POST"
    });

    expect(ensureSameOrigin(request)).toBeNull();
  });

  it("keeps blocking non-loopback origin mismatches", async () => {
    const request = new Request("http://127.0.0.1:3001/api/auth/login", {
      headers: {
        origin: "http://example.com"
      },
      method: "POST"
    });

    const response = ensureSameOrigin(request);

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: "Origen no permitido." });
  });
});
