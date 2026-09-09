import type { Prisma } from "@prisma/client";
import type { UserRating } from "@/lib/types";
import { parseWatchDate } from "@/lib/record-dates";

// Every write requires the transaction client supplied by the shared coordinator.

export function mapRatingRecordsToStateEntries(records: Array<{
  id: string;
  movieId: string;
  userId: string;
  score: number;
  comment: string | null;
  watchedOn: Date | null;
}>): UserRating[] {
  return records.map((entry) => ({
    id: entry.id,
    movieId: entry.movieId,
    userId: entry.userId,
    score: entry.score,
    comment: entry.comment ?? undefined,
    watchedOn: entry.watchedOn?.toISOString()
  }));
}

export async function upsertRatingToDatabase(rating: UserRating, client: Prisma.TransactionClient) {
  await client.ratingRecord.upsert({
    where: {
      movieId_userId: {
        movieId: rating.movieId,
        userId: rating.userId
      }
    },
    create: {
      id: rating.id,
      movieId: rating.movieId,
      userId: rating.userId,
      score: rating.score,
      comment: rating.comment,
      watchedOn: parseWatchDate(rating.watchedOn),
      createdAt: parseWatchDate(rating.watchedOn) ?? new Date()
    },
    update: {
      id: rating.id,
      score: rating.score,
      comment: rating.comment,
      watchedOn: parseWatchDate(rating.watchedOn)
    }
  });
}
