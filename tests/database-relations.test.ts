import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.CONCURRENCY_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/cine_concurrency_test") {
    throw new Error("Relation tests require a local cine_concurrency_test database.");
  }
}

describe.skipIf(!databaseUrl)("database foreign keys", () => {
  let prisma: PrismaClient;
  beforeAll(() => { prisma = new PrismaClient({ datasourceUrl: databaseUrl }); });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "WeeklyBatchItemRecord", "WeeklyBatchRecord", "RatingRecord", "WatchEntryRecord", "PendingMovie", "MovieRecord", "UserRecord", "AppSnapshot"');
    await prisma.userRecord.create({ data: { id: "user", name: "Test", username: "test", email: "test@example.invalid", passwordHash: "synthetic" } });
    await prisma.movieRecord.create({ data: { id: "movie", slug: "movie", data: {} } });
    await prisma.weeklyBatchRecord.create({ data: { id: "batch", groupId: "group", weekOf: new Date("2026-09-07") } });
  });

  const relations = ["pending", "watch", "rating", "selection", "item"] as const;
  function referenceMovie(relation: typeof relations[number], movieId: string) {
    switch (relation) {
      case "pending": return prisma.pendingMovie.create({ data: { groupId: "group", movieId } });
      case "watch": return prisma.watchEntryRecord.create({ data: { id: "watch", groupId: "group", movieId } });
      case "rating": return prisma.ratingRecord.create({ data: { id: "rating", userId: "user", movieId, score: 0 } });
      case "selection": return prisma.weeklyBatchRecord.update({ where: { id: "batch" }, data: { selectedMovieId: movieId } });
      case "item": return prisma.weeklyBatchItemRecord.create({ data: { id: "item", batchId: "batch", movieId, score: 80, summary: "Test", reasons: [] } });
    }
  }

  it.each(relations)("rejects a missing movie in %s", async relation => {
    await expect(referenceMovie(relation, "missing")).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects a rating whose user does not exist", async () => {
    await expect(prisma.ratingRecord.create({ data: { id: "rating", movieId: "movie", userId: "missing", score: 8 } }))
      .rejects.toMatchObject({ code: "P2003" });
  });

  it.each(relations)("preserves a movie referenced by %s when deletion is attempted", async relation => {
    await referenceMovie(relation, "movie");
    await expect(prisma.movieRecord.delete({ where: { id: "movie" } })).rejects.toMatchObject({ code: "P2003" });
    expect(await prisma.movieRecord.count()).toBe(1);
  });

  it("preserves a user and their ratings when deletion is attempted", async () => {
    await referenceMovie("rating", "movie");
    await expect(prisma.userRecord.delete({ where: { id: "user" } })).rejects.toMatchObject({ code: "P2003" });
    expect(await prisma.userRecord.count()).toBe(1);
    expect(await prisma.ratingRecord.count()).toBe(1);
  });

  it("allows an unselected batch and clearing its selection", async () => {
    expect((await prisma.weeklyBatchRecord.findUniqueOrThrow({ where: { id: "batch" } })).selectedMovieId).toBeNull();
    await referenceMovie("selection", "movie");
    await prisma.weeklyBatchRecord.update({ where: { id: "batch" }, data: { selectedMovieId: null } });
    await prisma.movieRecord.delete({ where: { id: "movie" } });
    expect(await prisma.weeklyBatchRecord.count()).toBe(1);
  });

  it("retains the existing batch-to-item cascade without deleting the movie", async () => {
    await referenceMovie("item", "movie");
    await prisma.weeklyBatchRecord.delete({ where: { id: "batch" } });
    expect(await prisma.weeklyBatchItemRecord.count()).toBe(0);
    expect(await prisma.movieRecord.count()).toBe(1);
  });
});
