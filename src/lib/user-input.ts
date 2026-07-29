import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { slugify } from "@/lib/utils";

export function normalizeUsername(value: string) {
  return slugify(value).replace(/-/g, "");
}

export function normalizeIdentity(value: string) {
  return normalizeUsername(value.trim());
}

export function secureStringMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) {
    return false;
  }

  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHash, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

export function validateUsername(value: string) {
  if (value.length < 3 || value.length > 32) {
    throw new Error("El usuario debe tener entre 3 y 32 caracteres.");
  }
}

export function validateDisplayName(value: string) {
  if (value.length < 2 || value.length > 60) {
    throw new Error("El nombre visible debe tener entre 2 y 60 caracteres.");
  }
}

export function validatePassword(value: string) {
  if (value.length < 8 || value.length > 128) {
    throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");
  }
}

export function sanitizeComment(value?: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length > 1000) {
    throw new Error("El comentario no puede superar los 1000 caracteres.");
  }

  return trimmed;
}

export function sanitizeAvatarDataUrl(value?: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }

  const isAllowedImage = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(trimmed);
  if (!isAllowedImage) {
    throw new Error("El avatar debe ser una imagen PNG, JPG, WEBP o GIF.");
  }

  if (trimmed.length > 2_000_000) {
    throw new Error("El avatar es demasiado grande.");
  }

  return trimmed;
}
