const QUARTER_EPSILON = 1e-9;

export type OperationalHealthData = {
  users: Array<{ id: string }>;
  movies: Array<{ id: string }>;
  pendingMovies: Array<{ groupId: string; movieId: string }>;
  watchEntries: Array<{ groupId: string; movieId: string }>;
  ratings: Array<{ id: string; movieId: string; userId: string; score: number }>;
  weeklyBatches: Array<{ id: string; selectedMovieId: string | null }>;
  weeklyBatchItems: Array<{ batchId: string; movieId: string }>;
};

export type OperationalHealthReport = {
  healthy: boolean;
  counts: Record<string, number>;
  issues: string[];
};

export function analyzeOperationalHealth(data: OperationalHealthData): OperationalHealthReport {
  const userIds = new Set(data.users.map(({ id }) => id));
  const movieIds = new Set(data.movies.map(({ id }) => id));
  const batchIds = new Set(data.weeklyBatches.map(({ id }) => id));
  const watched = new Set(data.watchEntries.map(({ groupId, movieId }) => `${groupId}:${movieId}`));
  const issues = new Set<string>();

  if (userIds.size === 0) issues.add("users_empty");
  if (movieIds.size === 0) issues.add("movies_empty");

  for (const entry of data.pendingMovies) {
    if (!movieIds.has(entry.movieId)) issues.add("pending_movie_orphan");
    if (watched.has(`${entry.groupId}:${entry.movieId}`)) issues.add("movie_pending_and_watched");
  }

  for (const entry of data.watchEntries) {
    if (!movieIds.has(entry.movieId)) issues.add("watch_movie_orphan");
  }

  for (const entry of data.ratings) {
    if (!movieIds.has(entry.movieId)) issues.add("rating_movie_orphan");
    if (!userIds.has(entry.userId)) issues.add("rating_user_orphan");
    if (
      !Number.isFinite(entry.score) ||
      entry.score < 0 ||
      entry.score > 10 ||
      Math.abs(entry.score * 4 - Math.round(entry.score * 4)) > QUARTER_EPSILON
    ) {
      issues.add("rating_score_invalid");
    }
  }

  for (const entry of data.weeklyBatchItems) {
    if (!batchIds.has(entry.batchId)) issues.add("batch_item_batch_orphan");
    if (!movieIds.has(entry.movieId)) issues.add("batch_item_movie_orphan");
  }

  for (const batch of data.weeklyBatches) {
    if (batch.selectedMovieId && !movieIds.has(batch.selectedMovieId)) {
      issues.add("batch_selection_movie_orphan");
    }
  }

  return {
    healthy: issues.size === 0,
    counts: {
      users: data.users.length,
      movies: data.movies.length,
      pendingMovies: data.pendingMovies.length,
      watchEntries: data.watchEntries.length,
      ratings: data.ratings.length,
      weeklyBatches: data.weeklyBatches.length,
      weeklyBatchItems: data.weeklyBatchItems.length
    },
    issues: [...issues].sort()
  };
}

async function readOperationalHealthData(): Promise<OperationalHealthData> {
  const { prisma } = await import("@/lib/prisma");
  const [
    users,
    movies,
    pendingMovies,
    watchEntries,
    ratings,
    weeklyBatches,
    weeklyBatchItems
  ] = await Promise.all([
    prisma.userRecord.findMany({ select: { id: true } }),
    prisma.movieRecord.findMany({ select: { id: true } }),
    prisma.pendingMovie.findMany({ select: { groupId: true, movieId: true } }),
    prisma.watchEntryRecord.findMany({ select: { groupId: true, movieId: true } }),
    prisma.ratingRecord.findMany({ select: { id: true, movieId: true, userId: true, score: true } }),
    prisma.weeklyBatchRecord.findMany({ select: { id: true, selectedMovieId: true } }),
    prisma.weeklyBatchItemRecord.findMany({ select: { batchId: true, movieId: true } })
  ]);

  return {
    users,
    movies,
    pendingMovies,
    watchEntries,
    ratings,
    weeklyBatches,
    weeklyBatchItems
  };
}

export async function runOperationalHealthCheck(timeoutMs = 8_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Database health check timed out.")), timeoutMs);
      timer.unref?.();
    });
    const data = await Promise.race([readOperationalHealthData(), timeout]);
    return analyzeOperationalHealth(data);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
