import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readDatabaseTables, buildBackupPayload, validateBackupPayload } from "../scripts/lib/database-operations.mjs";
import { seedDatabase } from "../scripts/lib/database-seed.mjs";
import { applyMovieMetadataChanges, cleanTechnicalMovies } from "../src/lib/database-maintenance.mjs";
import { withConsistentRead } from "../src/lib/database-transactions.mjs";
import { withDatabaseMutation } from "../src/lib/mutation-lock";

const databaseUrl = process.env.CONCURRENCY_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/cine_concurrency_test") {
    throw new Error("Administrative tests require a local cine_concurrency_test database.");
  }
}

function fixture() {
  const movies = ["Film", "F1 Review 1987"].map((title, index) => ({
    id: `movie_${index}`, slug: `film-${index}`, title, year: 2025, genres: ["Drama"],
    externalRating: { source: "TMDb", value: "80%" }, metadataVersion: 999
  }));
  return {
    users: [{ id: "user", name: "Before", username: "test", email: "test@example.invalid", passwordHash: "synthetic" }],
    movies, group: { id: "group", name: "Test", memberIds: ["user"] },
    ratings: [{ id: "rating", movieId: "movie_0", userId: "user", score: 6.25 }],
    pendingMovieIds: ["movie_1"],
    watchEntries: [{ id: "watch", movieId: "movie_0", groupId: "group", watchedOn: "2026-09-01" }],
    weeklyBatches: [{ id: "batch", groupId: "group", weekOf: "2026-09-07", createdAt: "2026-09-07", selectedMovieId: "movie_1",
      items: [{ id: "item", movieId: "movie_1", score: 80, summary: "Test", reasons: [] }] }],
    activity: [{ movieId: "movie_1", label: "Technical" }, { movieId: "movie_0", label: "Keep" }]
  };
}

function gate() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

it("rejects incomplete or inconsistent seed input before opening a write transaction", async () => {
  const prisma = { $transaction: () => { throw new Error("Unexpected transaction"); } };
  await expect(seedDatabase(prisma, {})).rejects.toThrow("colecciones");
  const state = fixture();
  state.ratings[0].movieId = "missing";
  await expect(seedDatabase(prisma, state)).rejects.toThrow("integridad");
});

describe.skipIf(!databaseUrl)("administrative operations with concurrent PostgreSQL writers", () => {
  let prisma;
  let app;
  beforeAll(() => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    app = new PrismaClient({ datasourceUrl: databaseUrl });
  });
  afterAll(async () => { await prisma?.$disconnect(); await app?.$disconnect(); });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "WeeklyBatchItemRecord", "WeeklyBatchRecord", "RatingRecord", "WatchEntryRecord", "PendingMovie", "MovieRecord", "UserRecord", "AppSnapshot"');
    await seedDatabase(prisma, fixture());
  });
  afterEach(async () => {
    for (const table of ["RatingRecord", "AppSnapshot", "MovieRecord"]) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS admin_test_failure ON "${table}"`);
    }
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS admin_test_failure()');
  });

  async function failOn(table, event) {
    await prisma.$executeRawUnsafe("CREATE FUNCTION admin_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected administrative failure'; END $$");
    await prisma.$executeRawUnsafe(`CREATE TRIGGER admin_test_failure BEFORE ${event} ON "${table}" FOR EACH ROW EXECUTE FUNCTION admin_test_failure()`);
  }

  async function waitForBlockedWriter() {
    await expect.poll(async () => {
      const [row] = await prisma.$queryRaw`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND classid = 1128877637 AND objid = 1 AND NOT granted`;
      return row.count;
    }, { timeout: 5000 }).toBeGreaterThan(0);
  }

  it("exports one committed state even when an app write commits between table reads", async () => {
    const usersRead = gate();
    const writeDone = gate();
    const instrumented = prisma.$extends({ query: {
      userRecord: { async findMany({ args, query }) { const result = await query(args); usersRead.resolve(); return result; } },
      movieRecord: { async findMany({ args, query }) { await writeDone.promise; return query(args); } }
    } });
    const copying = readDatabaseTables(instrumented);
    try {
      await usersRead.promise;
      await withDatabaseMutation(app, async tx => {
        await tx.userRecord.update({ where: { id: "user" }, data: { name: "After" } });
        await tx.movieRecord.update({ where: { id: "movie_0" }, data: { data: { ...fixture().movies[0], title: "After" } } });
        await tx.ratingRecord.update({ where: { id: "rating" }, data: { score: 9 } });
        await tx.appSnapshot.update({ where: { id: "main" }, data: { data: { version: "after" } } });
      });
    } finally { writeDone.resolve(); }
    const tables = await copying;
    expect(tables.users[0].name).toBe("Before");
    expect(tables.movies.find(movie => movie.id === "movie_0").data.title).toBe("Film");
    expect(tables.ratings[0].score).toBe(6.25);
    expect(tables.appSnapshots[0].data.group.id).toBe("group");
    expect((await readDatabaseTables(prisma)).users[0].name).toBe("After");
    expect(validateBackupPayload(buildBackupPayload({ target: { environment: "development" }, tables, consistency: "repeatable-read" })).metadata.consistency).toBe("repeatable-read");
  });

  it("enforces read-only transactions and releases them after a failed write", async () => {
    await expect(withConsistentRead(prisma, tx => tx.userRecord.update({ where: { id: "user" }, data: { name: "Forbidden" } }))).rejects.toThrow();
    expect((await readDatabaseTables(prisma)).users[0].name).toBe("Before");
    await withDatabaseMutation(app, tx => tx.userRecord.update({ where: { id: "user" }, data: { name: "Allowed" } }));
  });

  it("waits behind the application lock before seeding and releases it on commit", async () => {
    const locked = gate(); const release = gate();
    const writing = withDatabaseMutation(app, async tx => {
      await tx.userRecord.update({ where: { id: "user" }, data: { name: "App" } });
      locked.resolve(); await release.promise;
    });
    await locked.promise;
    const state = fixture(); state.users[0].name = "Imported";
    const seeding = seedDatabase(prisma, state);
    try { await waitForBlockedWriter(); } finally { release.resolve(); }
    await writing; await seeding;
    expect((await readDatabaseTables(prisma)).users[0].name).toBe("Imported");
    await withDatabaseMutation(app, tx => tx.ratingRecord.update({ where: { id: "rating" }, data: { score: 10 } }));
    expect((await readDatabaseTables(prisma)).ratings[0].score).toBe(10);
  });

  it("rolls back every seed phase, including the snapshot, on a late insert failure", async () => {
    const before = await readDatabaseTables(prisma);
    await failOn("RatingRecord", "INSERT");
    const state = fixture(); state.users[0].name = "Imported"; state.movies[0].title = "Imported";
    await expect(seedDatabase(prisma, state)).rejects.toThrow();
    expect(await readDatabaseTables(prisma)).toEqual(before);
  });

  it("rechecks metadata after waiting for an app edit and preserves the newer data", async () => {
    const record = await prisma.movieRecord.findUniqueOrThrow({ where: { id: "movie_0" } });
    const locked = gate(); const release = gate();
    const writing = withDatabaseMutation(app, async tx => {
      await tx.movieRecord.update({ where: { id: record.id }, data: { data: { ...record.data, title: "Newer" } } });
      locked.resolve(); await release.promise;
    });
    await locked.promise;
    const repairing = applyMovieMetadataChanges(prisma, [{ record, nextData: { ...record.data, language: "Español" } }]);
    try { await waitForBlockedWriter(); } finally { release.resolve(); }
    await writing;
    expect(await repairing).toEqual({ updated: 0, skipped: [record.id] });
    expect((await prisma.movieRecord.findUniqueOrThrow({ where: { id: record.id } })).data.title).toBe("Newer");
  });

  it("updates metadata and snapshot together while preserving unrelated snapshot content", async () => {
    const record = await prisma.movieRecord.findUniqueOrThrow({ where: { id: "movie_0" } });
    const nextData = { ...record.data, language: "Español" };
    expect(await applyMovieMetadataChanges(prisma, [{ record, nextData }])).toEqual({ updated: 1, skipped: [] });
    const tables = await readDatabaseTables(prisma);
    expect(tables.appSnapshots[0].data.movies[0]).toEqual(nextData);
    expect(tables.movies.find(movie => movie.id === record.id).data).toEqual(nextData);
    expect(tables.appSnapshots[0].data.users).toEqual(fixture().users);
  });

  it("rolls back metadata if the snapshot cannot be saved", async () => {
    const before = await readDatabaseTables(prisma);
    await failOn("AppSnapshot", "UPDATE");
    const record = before.movies[0];
    await expect(applyMovieMetadataChanges(prisma, [{ record, nextData: { ...record.data, language: "Español" } }])).rejects.toThrow();
    expect(await readDatabaseTables(prisma)).toEqual(before);
  });

  it("rechecks technical titles under the lock after an app edit", async () => {
    const locked = gate(); const release = gate();
    const writing = withDatabaseMutation(app, async tx => {
      await tx.movieRecord.update({ where: { id: "movie_1" }, data: { data: { ...fixture().movies[1], title: "Keep this movie" } } });
      locked.resolve(); await release.promise;
    });
    await locked.promise;
    const cleaning = cleanTechnicalMovies(prisma, { apply: true });
    try { await waitForBlockedWriter(); } finally { release.resolve(); }
    await writing;
    expect(await cleaning).toEqual([]);
    expect(await prisma.movieRecord.count()).toBe(2);
  });

  it("keeps dry runs read-only, removes technical references and never recreates a deleted movie", async () => {
    const before = await readDatabaseTables(prisma);
    const record = before.movies.find(movie => movie.id === "movie_1");
    expect(await cleanTechnicalMovies(prisma)).toHaveLength(1);
    expect(await readDatabaseTables(prisma)).toEqual(before);
    expect(await cleanTechnicalMovies(prisma, { apply: true })).toHaveLength(1);
    const tables = await readDatabaseTables(prisma);
    expect(tables.pendingMovies).toEqual([]);
    expect(tables.weeklyBatchItems).toEqual([]);
    expect(tables.weeklyBatches[0].selectedMovieId).toBeNull();
    expect(tables.appSnapshots[0].data.pendingMovieIds).toEqual([]);
    expect(tables.appSnapshots[0].data.weeklyBatches[0]).toMatchObject({ selectedMovieId: null, items: [] });
    expect(tables.appSnapshots[0].data.activity).toEqual([{ movieId: "movie_0", label: "Keep" }]);
    expect(tables.ratings).toHaveLength(1);
    expect(await applyMovieMetadataChanges(prisma, [{ record, nextData: { ...record.data, language: "Español" } }])).toEqual({ updated: 0, skipped: [record.id] });
  });

  it("rolls back the cleanup and its snapshot changes on a late delete failure", async () => {
    const before = await readDatabaseTables(prisma);
    await failOn("MovieRecord", "DELETE");
    await expect(cleanTechnicalMovies(prisma, { apply: true })).rejects.toThrow();
    expect(await readDatabaseTables(prisma)).toEqual(before);
  });
});
