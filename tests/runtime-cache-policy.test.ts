import { describe, expect, it } from "vitest";

import { shouldUseProcessLocalMutableCache } from "@/lib/runtime-cache-policy";

describe("runtime cache policy", () => {
  it("bypasses process-local mutable caches for database deployments", () => {
    expect(shouldUseProcessLocalMutableCache(true)).toBe(false);
  });

  it("keeps process-local mutable caches for the local file-backed runtime", () => {
    expect(shouldUseProcessLocalMutableCache(false)).toBe(true);
  });
});
