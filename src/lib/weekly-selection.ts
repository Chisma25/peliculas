import type { WeeklyRecommendationBatch } from "@/lib/types";
import { startOfWeek } from "@/lib/utils";

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
  watchedMovieIds: Iterable<string>,
  pendingMovieIds: Iterable<string>
) {
  if (!batch?.selectedMovieId) {
    return false;
  }

  const watchedIds = watchedMovieIds instanceof Set ? watchedMovieIds : new Set(watchedMovieIds);
  const pendingIds = pendingMovieIds instanceof Set ? pendingMovieIds : new Set(pendingMovieIds);
  return !watchedIds.has(batch.selectedMovieId) && pendingIds.has(batch.selectedMovieId);
}

export function isWeeklyBatchCurrent(batch: WeeklyRecommendationBatch | null, now = new Date()) {
  if (!batch) {
    return false;
  }

  const batchDate = new Date(batch.weekOf);
  if (Number.isNaN(batchDate.getTime())) {
    return false;
  }

  return startOfWeek(batchDate).getTime() === startOfWeek(now).getTime();
}
