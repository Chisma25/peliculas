import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/session";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("credential-bound sessions", () => {
  it("authenticates the current credentials and revokes tokens after password changes", async () => {
    const token = await createSessionToken("member.one", "salt:old-password-hash");
    expect(await verifySessionToken(token, "salt:old-password-hash")).toBe("member.one");
    expect(await verifySessionToken(token, "other-salt:new-password-hash")).toBeNull();
    expect(await verifySessionToken(token, "")).toBeNull();
    expect(token).not.toContain("old-password-hash");
    expect(await verifySessionToken(await createSessionToken("member.one", "other-salt:new-password-hash"), "other-salt:new-password-hash")).toBe("member.one");
  });

  it("rejects old formats, tampering, extra fields and expired tokens", async () => {
    vi.useFakeTimers();
    const token = await createSessionToken("member", "hash");
    expect(await verifySessionToken("member.9999999999999.signature", "hash")).toBeNull();
    expect(await verifySessionToken(token.replace("member", "admin"), "hash")).toBeNull();
    expect(await verifySessionToken(`${token}.extra`, "hash")).toBeNull();
    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000);
    expect(await verifySessionToken(token, "hash")).toBeNull();
  });

  it("requires active credentials and a configured production secret", async () => {
    await expect(createSessionToken("member", "")).rejects.toThrow();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    await expect(createSessionToken("member", "hash")).rejects.toThrow();
    vi.stubEnv("SESSION_SECRET", "too-short");
    await expect(createSessionToken("member", "hash")).rejects.toThrow();
    vi.stubEnv("SESSION_SECRET", "a-production-secret-with-at-least-32-characters");
    expect(await verifySessionToken(await createSessionToken("member", "hash"), "hash")).toBe("member");
  });
});
