const AVATAR_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([a-z0-9+/=\s]+)$/i;

export type ParsedAvatarData = {
  bytes: Uint8Array;
  contentType: string;
};

export function getAvatarDeliveryUrl(userId: string) {
  return `/api/users/${encodeURIComponent(userId)}/avatar`;
}

export function parseAvatarDataUrl(value: string | null | undefined): ParsedAvatarData | null {
  const match = value?.trim().match(AVATAR_DATA_URL_PATTERN);
  if (!match) {
    return null;
  }

  try {
    const subtype = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
    const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    if (bytes.length === 0) {
      return null;
    }

    return {
      bytes,
      contentType: `image/${subtype}`
    };
  } catch {
    return null;
  }
}
