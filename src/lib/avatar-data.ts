const AVATAR_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([a-z0-9+/=\s]+)$/i;

export type ParsedAvatarData = {
  bytes: Uint8Array;
  contentType: string;
};

function getAvatarVersion(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getAvatarDeliveryUrl(userId: string, avatarDataUrl?: string | null) {
  const path = `/api/users/${encodeURIComponent(userId)}/avatar`;
  return avatarDataUrl ? `${path}?v=${getAvatarVersion(avatarDataUrl)}` : path;
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
