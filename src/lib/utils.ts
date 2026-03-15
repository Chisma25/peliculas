import { Movie, UserRating } from "@/lib/types";

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatScore(
  value: number,
  options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }
) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-ES", options).format(value);
}

export function formatFitScore(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

export function getMovieAverage(movieId: string, ratings: UserRating[]) {
  return average(ratings.filter((rating) => rating.movieId === movieId).map((rating) => rating.score));
}

export function getMovieTone(movie: Movie) {
  const palette = [
    "linear-gradient(135deg, rgba(209,62,38,0.95), rgba(27,34,56,0.9))",
    "linear-gradient(135deg, rgba(57,115,149,0.95), rgba(8,15,28,0.94))",
    "linear-gradient(135deg, rgba(208,148,44,0.9), rgba(39,25,10,0.95))",
    "linear-gradient(135deg, rgba(108,54,128,0.92), rgba(17,20,28,0.96))",
    "linear-gradient(135deg, rgba(34,132,105,0.94), rgba(8,23,24,0.95))"
  ];

  return palette[movie.title.length % palette.length];
}

export function startOfWeek(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay() || 7;
  current.setHours(0, 0, 0, 0);
  current.setDate(current.getDate() - day + 1);
  return current;
}

export function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export function safeId(prefix: string, seed: string) {
  return `${prefix}_${slugify(seed)}_${Math.random().toString(36).slice(2, 8)}`;
}
