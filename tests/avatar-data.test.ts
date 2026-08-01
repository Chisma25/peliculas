import { describe, expect, it } from "vitest";

import { getAvatarDeliveryUrl, parseAvatarDataUrl } from "@/lib/avatar-data";
import { optimizeAvatarImage } from "@/lib/avatar-image";
import sharp from "sharp";

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

  it("versions delivery paths when the stored avatar changes", () => {
    const first = getAvatarDeliveryUrl("member", "data:image/png;base64,Zmlyc3Q=");
    const repeated = getAvatarDeliveryUrl("member", "data:image/png;base64,Zmlyc3Q=");
    const second = getAvatarDeliveryUrl("member", "data:image/png;base64,c2Vjb25k");

    expect(first).toBe(repeated);
    expect(first).toMatch(/^\/api\/users\/member\/avatar\?v=/);
    expect(second).not.toBe(first);
  });

  it("delivers avatars as compact square WebP images", async () => {
    const original = await sharp({
      create: {
        width: 900,
        height: 600,
        channels: 3,
        background: { r: 33, g: 58, b: 91 }
      }
    })
      .png()
      .toBuffer();

    const optimized = await optimizeAvatarImage(original);
    const metadata = await sharp(optimized.bytes).metadata();

    expect(optimized.contentType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(172);
    expect(metadata.height).toBe(172);
    expect(optimized.bytes.byteLength).toBeLessThan(original.byteLength);
  });
});
