export type ExternalRating = {
  source: "Rotten Tomatoes" | "IMDb" | "Metacritic" | "TMDb";
  value: string;
  url?: string;
};

export type Movie = {
  id: string;
  slug: string;
  title: string;
  year: number;
  releaseDate?: string;
  releaseDateEs?: string;
  synopsis: string;
  durationMinutes: number;
  genres: string[];
  director: string;
  cast: string[];
  language: string;
  country: string;
  trailerUrl?: string;
  posterUrl?: string;
  backdrop?: string;
  externalRating: ExternalRating;
  sourceIds?: {
    tmdb?: string;
    imdb?: string;
  };
};

export type User = {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarSeed: string;
  avatarUrl?: string;
  passwordHash: string;
  isAdmin?: boolean;
};

export type Group = {
  id: string;
  name: string;
  memberIds: string[];
  accentColor: string;
};

export type WatchEntry = {
  id: string;
  movieId: string;
  groupId: string;
  watchedOn?: string;
  selectedForWeek?: string;
};

export type UserRating = {
  id: string;
  movieId: string;
  userId: string;
  score: number;
  comment?: string;
  watchedOn?: string;
};

export type RecommendationReason = {
  label: string;
  detail: string;
};

export type RecommendationMetric = {
  label: string;
  value: number;
  tone?: "warm" | "cool" | "neutral";
};

export type WeeklyRecommendationItem = {
  id: string;
  movieId: string;
  score: number;
  summary: string;
  reasons: RecommendationReason[];
  metrics?: RecommendationMetric[];
};

export type WeeklyRecommendationBatch = {
  id: string;
  groupId: string;
  weekOf: string;
  createdAt: string;
  items: WeeklyRecommendationItem[];
  selectedMovieId?: string;
};

export type UpcomingReleaseSuggestion = {
  movie: Movie;
  releaseDate: string;
  score: number;
  metrics: RecommendationMetric[];
};

export type ActivityItem = {
  type: "watched" | "rated" | "recommended" | "queued";
  label: string;
  date: string;
  movieId?: string;
  userId?: string;
};

export type AppState = {
  users: User[];
  group: Group;
  movies: Movie[];
  watchEntries: WatchEntry[];
  ratings: UserRating[];
  pendingMovieIds: string[];
  weeklyBatches: WeeklyRecommendationBatch[];
  activity: ActivityItem[];
};
