import {
  Movie,
  UpcomingReleaseSuggestion,
  UserRating,
  WatchEntry,
  WeeklyRecommendationBatch,
  WeeklyRecommendationItem
} from "@/lib/types";

export type HistoryFilters = {
  genre?: string;
  year?: string;
  search?: string;
  sort?: "watched-desc" | "group-desc" | "group-asc" | "mine-desc" | "mine-asc";
};

export type HistoryItem = {
  movie: Movie;
  watchedOn: string | undefined;
  groupAverage: number;
  ratings: UserRating[];
  userRating: number | undefined;
};

export type DashboardData = {
  selectedMovie: Movie | null;
  selectedWatchEntry: WatchEntry | null;
  upcomingReleases: UpcomingReleaseSuggestion[];
  stats: {
    watchedCount: number;
    averageScore: number;
    pendingCount: number;
  };
};

export type DashboardOverviewData = Omit<DashboardData, "upcomingReleases">;

export type PendingListBase = {
  batch: WeeklyRecommendationBatch | null;
  genres: string[];
  totalPendingCount: number;
  filteredPendingIds: string[];
  weeklyOptions: WeeklyRecommendationItem[];
};

export type ViewedHistorySummary = {
  movieId: string;
  watchedOn: string | undefined;
  groupAverage: number;
  userRating: number | undefined;
};

export type ViewedListBase = {
  genres: string[];
  totalHistoryCount: number;
  filteredHistory: ViewedHistorySummary[];
};

export const APP_REGISTRATION_FALLBACK_DATE = "2026-03-14T17:09:52.000Z";
