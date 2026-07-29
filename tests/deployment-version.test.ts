import { describe, expect, it } from "vitest";

import { getDeploymentVersion } from "@/lib/deployment-version";

describe("deployment version", () => {
  it("reads the Vercel commit, branch and environment", () => {
    expect(
      getDeploymentVersion({
        VERCEL_GIT_COMMIT_SHA: "1234567890abcdef",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "cine-semanal.vercel.app"
      })
    ).toEqual({
      commitSha: "1234567890abcdef",
      shortCommitSha: "1234567",
      commitRef: "main",
      environment: "production",
      deploymentUrl: "https://cine-semanal.vercel.app"
    });
  });

  it("uses explicit fallbacks outside Vercel", () => {
    expect(
      getDeploymentVersion({
        COMMIT_SHA: "abcdef123456",
        COMMIT_REF: "release",
        APP_ENV: "preview"
      })
    ).toMatchObject({
      commitSha: "abcdef123456",
      shortCommitSha: "abcdef1",
      commitRef: "release",
      environment: "preview"
    });
  });

  it("returns a clear local identity when Git metadata is unavailable", () => {
    expect(getDeploymentVersion({})).toEqual({
      commitSha: "local",
      shortCommitSha: "local",
      commitRef: "local",
      environment: "unknown",
      deploymentUrl: null
    });
  });
});
