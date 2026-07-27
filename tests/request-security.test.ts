import { describe, expect, it } from "vitest";

import { ensureSameOrigin, readJsonBody } from "@/lib/request-security";

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

describe("readJsonBody", () => {
  it("returns parsed JSON for valid requests", async () => {
    const result = await readJsonBody<{ title: string }>(
      new Request("https://example.com/api/pending/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Matrix" })
      })
    );

    expect(result).toEqual({ data: { title: "Matrix" } });
  });

  it("returns a useful 400 response for malformed JSON", async () => {
    const result = await readJsonBody(
      new Request("https://example.com/api/pending/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json}"
      })
    );

    expect(result.response?.status).toBe(400);
    if (result.response) {
      await expect(result.response.json()).resolves.toEqual({ error: "El JSON enviado no es válido." });
    }
  });

  it("rejects unsupported content types and oversized payloads", async () => {
    const unsupported = await readJsonBody(new Request("https://example.com", { method: "POST", body: "hello" }));
    expect(unsupported.response?.status).toBe(415);

    const oversized = await readJsonBody(
      new Request("https://example.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "long" })
      }),
      { maxBytes: 4 }
    );
    expect(oversized.response?.status).toBe(413);
  });
});
