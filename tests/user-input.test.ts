import { describe, expect, it } from "vitest";

import {
  hashPassword,
  normalizeIdentity,
  sanitizeAvatarDataUrl,
  sanitizeComment,
  secureStringMatch,
  validatePassword,
  validateUsername,
  verifyPassword
} from "../src/lib/user-input";

describe("user input and credentials", () => {
  it("normalizes visible identities into stable usernames", () => {
    expect(normalizeIdentity("  José Nieto  ")).toBe("josenieto");
  });

  it("hashes passwords with a salt and verifies them safely", () => {
    const firstHash = hashPassword("UnaClaveSegura!2026");
    const secondHash = hashPassword("UnaClaveSegura!2026");

    expect(firstHash).not.toBe(secondHash);
    expect(verifyPassword("UnaClaveSegura!2026", firstHash)).toBe(true);
    expect(verifyPassword("OtraClave", firstHash)).toBe(false);
  });

  it("validates credential lengths and constant-time comparable secrets", () => {
    expect(() => validateUsername("is")).toThrow("entre 3 y 32");
    expect(() => validatePassword("corta")).toThrow("entre 8 y 128");
    expect(secureStringMatch("codigo-seguro", "codigo-seguro")).toBe(true);
    expect(secureStringMatch("codigo-seguro", "otro")).toBe(false);
  });

  it("trims comments and accepts only supported avatar data URLs", () => {
    expect(sanitizeComment("  Muy buena  ")).toBe("Muy buena");
    expect(sanitizeComment("   ")).toBeUndefined();
    expect(sanitizeAvatarDataUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(() => sanitizeAvatarDataUrl("https://example.com/avatar.png")).toThrow("imagen PNG");
  });
});
