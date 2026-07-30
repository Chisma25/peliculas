import { describe, expect, it } from "vitest";

import {
  DataUnavailableError,
  ensureDatabaseReadCanProceed,
  failClosedAfterDatabaseReadError,
  shouldFailClosedOnDatabaseError
} from "@/lib/data-availability";

describe("database read availability", () => {
  it("fails closed in Preview and Production", () => {
    expect(shouldFailClosedOnDatabaseError({ VERCEL_ENV: "preview" })).toBe(true);
    expect(shouldFailClosedOnDatabaseError({ VERCEL_ENV: "production" })).toBe(true);
    expect(() => failClosedAfterDatabaseReadError({ APP_ENV: "production" })).toThrow(DataUnavailableError);
  });

  it("keeps local fallback available only for development and tests", () => {
    expect(shouldFailClosedOnDatabaseError({ APP_ENV: "development" })).toBe(false);
    expect(shouldFailClosedOnDatabaseError({ APP_ENV: "test" })).toBe(false);
    expect(failClosedAfterDatabaseReadError({ APP_ENV: "development" })).toBeUndefined();
  });

  it("blocks reads during a production backoff instead of returning stale data", () => {
    expect(() =>
      ensureDatabaseReadCanProceed(
        {
          usesDatabase: true,
          backoffUntil: 2_000,
          now: 1_000
        },
        { APP_ENV: "production" }
      )
    ).toThrow(DataUnavailableError);

    expect(
      ensureDatabaseReadCanProceed(
        {
          usesDatabase: true,
          backoffUntil: 2_000,
          now: 1_000
        },
        { APP_ENV: "development" }
      )
    ).toBe(false);
  });
});
