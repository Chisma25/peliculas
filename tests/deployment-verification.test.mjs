import { describe, expect, it } from "vitest";

import { verifyDeploymentPayload } from "../scripts/lib/deployment-verification.mjs";

const payload = {
  service: "cine-semanal",
  status: "ok",
  commitSha: "1234567890abcdef",
  commitRef: "main",
  environment: "production"
};

describe("deployment verification", () => {
  it("accepts the exact production deployment", () => {
    expect(
      verifyDeploymentPayload(payload, {
        commit: "1234567890abcdef",
        ref: "main",
        environment: "production"
      })
    ).toEqual([]);
  });

  it("reports every version mismatch", () => {
    expect(
      verifyDeploymentPayload(payload, {
        commit: "different",
        ref: "preview",
        environment: "preview"
      })
    ).toHaveLength(3);
  });

  it("rejects malformed responses", () => {
    expect(verifyDeploymentPayload(null, {})).toEqual([
      "La respuesta de versión no es un objeto JSON."
    ]);
  });
});
