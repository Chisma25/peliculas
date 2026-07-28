import type { WeeklyRecommendationBatch } from "@/lib/types";

export type WeeklySelectionSource = "recommendation" | "pending";

export function classifyWeeklySelection(
  batch: WeeklyRecommendationBatch,
  pendingMovieIds: Iterable<string>,
  movieId: string
): WeeklySelectionSource | null {
  if (batch.items.some((item) => item.movieId === movieId)) {
    return "recommendation";
  }

  const pendingIds = pendingMovieIds instanceof Set ? pendingMovieIds : new Set(pendingMovieIds);
  return pendingIds.has(movieId) ? "pending" : null;
}

export function shouldCarryWeeklySelection(
  batch: WeeklyRecommendationBatch | null,
  watchedMovieIds: Iterable<string>
) {
  if (!batch?.selectedMovieId) {
    return false;
  }

  const watchedIds = watchedMovieIds instanceof Set ? watchedMovieIds : new Set(watchedMovieIds);
  return !watchedIds.has(batch.selectedMovieId);
}
