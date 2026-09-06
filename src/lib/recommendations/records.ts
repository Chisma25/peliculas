import { RecommendationMetric, WeeklyRecommendationBatch, WeeklyRecommendationItem } from "@/lib/types";
import type { Prisma } from "@prisma/client";

// Mutations and page refreshes supply the shared transaction client. Standalone and
// bulk paths remain available for legacy deferred writes.
export function mapWeeklyBatchRecordsToStateEntries(
  records: Array<{
    id: string;
    groupId: string;
    weekOf: Date;
    createdAt: Date;
    selectedMovieId: string | null;
    items: Array<{
      id: string;
      movieId: string;
      score: number;
      summary: string;
      reasons: unknown;
      metrics: unknown;
      position: number;
    }>;
  }>
): WeeklyRecommendationBatch[] {
  return records.map((batch) => ({
    id: batch.id,
    groupId: batch.groupId,
    weekOf: batch.weekOf.toISOString(),
    createdAt: batch.createdAt.toISOString(),
    selectedMovieId: batch.selectedMovieId ?? undefined,
    items: [...batch.items]
      .sort((left, right) => left.position - right.position)
      .map((item) => ({
        id: item.id,
        movieId: item.movieId,
        score: item.score,
        summary: item.summary,
        reasons: Array.isArray(item.reasons) ? (item.reasons as WeeklyRecommendationItem["reasons"]) : [],
        metrics: Array.isArray(item.metrics) ? (item.metrics as RecommendationMetric[]) : undefined
      }))
  }));
}

export async function syncWeeklyBatchesToDatabase(groupId: string, weeklyBatches: WeeklyRecommendationBatch[]) {
  const { prisma } = await import("@/lib/prisma");
  const existingBatchIds = (
    await prisma.weeklyBatchRecord.findMany({
      where: { groupId },
      select: { id: true }
    })
  ).map((batch) => batch.id);

  await prisma.$transaction([
    ...(existingBatchIds.length > 0
      ? [prisma.weeklyBatchItemRecord.deleteMany({ where: { batchId: { in: existingBatchIds } } })]
      : []),
    prisma.weeklyBatchRecord.deleteMany({ where: { groupId } }),
    ...(weeklyBatches.length > 0
      ? [
          prisma.weeklyBatchRecord.createMany({
            data: weeklyBatches.map((batch) => ({
              id: batch.id,
              groupId: batch.groupId,
              weekOf: new Date(batch.weekOf),
              createdAt: new Date(batch.createdAt),
              selectedMovieId: batch.selectedMovieId ?? null
            })),
            skipDuplicates: true
          }),
          prisma.weeklyBatchItemRecord.createMany({
            data: weeklyBatches.flatMap((batch) =>
              batch.items.map((item, index) => ({
                id: item.id,
                batchId: batch.id,
                movieId: item.movieId,
                position: index,
                score: item.score,
                summary: item.summary,
                reasons: item.reasons,
                metrics: item.metrics ?? []
              }))
            ),
            skipDuplicates: true
          })
        ]
      : [])
  ]);
}

export async function insertWeeklyBatchToDatabase(batch: WeeklyRecommendationBatch, client?: Prisma.TransactionClient) {
  const execute = async (database: Prisma.TransactionClient) => {
    await database.weeklyBatchRecord.upsert({
      where: {
        id: batch.id
      },
      create: {
        id: batch.id,
        groupId: batch.groupId,
        weekOf: new Date(batch.weekOf),
        createdAt: new Date(batch.createdAt),
        selectedMovieId: batch.selectedMovieId ?? null
      },
      update: {
        weekOf: new Date(batch.weekOf),
        selectedMovieId: batch.selectedMovieId ?? null
      }
    });
    await database.weeklyBatchItemRecord.deleteMany({
      where: {
        batchId: batch.id
      }
    });
    await database.weeklyBatchItemRecord.createMany({
      data: batch.items.map((item, index) => ({
        id: item.id,
        batchId: batch.id,
        movieId: item.movieId,
        position: index,
        score: item.score,
        summary: item.summary,
        reasons: item.reasons,
        metrics: item.metrics ?? []
      })),
      skipDuplicates: true
    });
  };

  if (client) {
    await execute(client);
    return;
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.$transaction(execute);
}

export async function updateWeeklyBatchSelectionInDatabase(
  batchId: string,
  selectedMovieId?: string,
  client?: Prisma.TransactionClient
) {
  const database = client ?? (await import("@/lib/prisma")).prisma;
  await database.weeklyBatchRecord.update({
    where: {
      id: batchId
    },
    data: {
      selectedMovieId: selectedMovieId ?? null
    }
  });
}
