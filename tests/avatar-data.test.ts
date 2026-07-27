import { describe, expect, it } from "vitest";

import { getAvatarDeliveryUrl, parseAvatarDataUrl } from "@/lib/avatar-data";

describe("avatar delivery", () => {
  it("decodes supported avatar data URLs without returning the original payload", () => {
    const avatar = parseAvatarDataUrl("data:image/png;base64,aGVsbG8=");

    expect(avatar?.contentType).toBe("image/png");
    expect(Buffer.from(avatar?.bytes ?? []).toString("utf8")).toBe("hello");
  });

  it("normalizes jpg content types and rejects malformed values", () => {
    expect(parseAvatarDataUrl("data:image/jpg;base64,aGVsbG8=")?.contentType).toBe("image/jpeg");
    expect(parseAvatarDataUrl("https://example.com/avatar.png")).toBeNull();
    expect(parseAvatarDataUrl("data:text/plain;base64,aGVsbG8=")).toBeNull();
  });

  it("creates an encoded authenticated delivery path", () => {
    expect(getAvatarDeliveryUrl("member/with spaces")).toBe("/api/users/member%2Fwith%20spaces/avatar");
  });
});
