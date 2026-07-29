import type { Movie } from "@/lib/types";

export type FeatureMap = Record<string, number>;
export type CountMap = Record<string, number>;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeText(value: string | undefined | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function uniqueNormalized(values: string[]) {
  return unique(values.map((value) => normalizeText(value)).filter(Boolean));
}

export function normalizeFeatureMap(map: FeatureMap) {
  const entries = Object.entries(map);
  if (entries.length === 0) {
    return {};
  }

  const maxMagnitude = Math.max(...entries.map(([, value]) => Math.abs(value))) || 1;
  return Object.fromEntries(entries.map(([key, value]) => [key, value / maxMagnitude]));
}

export function normalizeCountMap(map: CountMap) {
  const entries = Object.entries(map);
  if (entries.length === 0) {
    return {};
  }

  const maxValue = Math.max(...entries.map(([, value]) => value)) || 1;
  return Object.fromEntries(entries.map(([key, value]) => [key, value / maxValue]));
}

export function incrementCount(map: CountMap, key: string, amount = 1) {
  if (!key) {
    return;
  }

  map[key] = (map[key] ?? 0) + amount;
}

export function adjustFeature(map: FeatureMap, key: string, amount: number) {
  if (!key || amount === 0) {
    return;
  }

  map[key] = (map[key] ?? 0) + amount;
}

export function getMovieDecade(movie: Movie) {
  if (!Number.isFinite(movie.year) || movie.year <= 0) {
    return "";
  }

  return `${Math.floor(movie.year / 10) * 10}s`;
}

export function parseExternalRating(movie: Movie) {
  const raw = movie.externalRating?.value?.trim();
  if (!raw) {
    return null;
  }

  if (raw.includes("%")) {
    const value = Number.parseFloat(raw.replace("%", ""));
    return Number.isFinite(value) ? clamp(value / 10, 0, 10) : null;
  }

  if (raw.includes("/100")) {
    const value = Number.parseFloat(raw.split("/100")[0]);
    return Number.isFinite(value) ? clamp(value / 10, 0, 10) : null;
  }

  if (raw.includes("/10")) {
    const value = Number.parseFloat(raw.split("/10")[0]);
    return Number.isFinite(value) ? clamp(value, 0, 10) : null;
  }

  const numeric = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric > 10 ? clamp(numeric / 10, 0, 10) : clamp(numeric, 0, 10);
}
