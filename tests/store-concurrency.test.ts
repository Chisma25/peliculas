import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { AppState, Movie } from "@/lib/types";
import { hashPassword, verifyPassword } from "@/lib/user-input";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/movie-provider", () => ({
  TMDB_METADATA_VERSION: 999,
  resolveMovieMetadata: async (movie: Movie) => movie
}));

const databaseUrl = process.env.CONCURRENCY_DATABASE_URL;
// These tests reset tables. Refuse all remote hosts and all other databases.
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/cine_concurrency_test") {
    throw new Error("Concurrency tests require a local cine_concurrency_test database.");
  }
}

const originalPassword = "Original-password-123";
function fixture(): AppState {
  const users = ["alpha", "beta", "admin"].map((id) => ({
    id, name: id, username: id, email: `${id}@example.invalid`, avatarSeed: id,
    passwordHash: hashPassword(originalPassword), isAdmin: id === "admin"
  }));
  const movies: Movie[] = Array.from({ length: 8 }, (_, i) => ({
    id: `movie_${i}`, slug: `film-${i}`, title: `Film ${i}`, year: 2025,
    synopsis: "Synthetic concurrency fixture.", genres: ["Drama"], director: "Test Director",
    cast: [], language: "Español", country: "España", durationMinutes: 90,
    posterUrl: "https://example.invalid/poster.jpg", metadataVersion: 999,
    externalRating: { source: "TMDb", value: "80%" }
  }));
  return { users, movies, group: { id: "group_cine_club", name: "Test group", memberIds: users.map(u => u.id), accentColor: "#fff" },
    pendingMovieIds: [], watchEntries: [], ratings: [], weeklyBatches: [], activity: [] };
}

describe.each(databaseUrl ? ["local", "database"] as const : ["local"] as const)("concurrent store mutations (%s)", (backend) => {
  let directory: string;
  let state: AppState;
  let store: typeof import("@/lib/store");
  let otherStore: typeof store;
  let prisma: PrismaClient | undefined;

  beforeEach(async () => {
    vi.resetModules();
    directory = mkdtempSync(join(tmpdir(), "cine-concurrency-"));
    vi.stubEnv("APP_DATA_DIR", directory);
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DATABASE_ENVIRONMENT", "development");
    vi.stubEnv("DATABASE_URL", backend === "database" ? databaseUrl! : "");
    vi.stubEnv("DIRECT_URL", backend === "database" ? databaseUrl! : "");
    state = fixture();
    if (backend === "database") {
      prisma = (await import("@/lib/prisma")).prisma;
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "WeeklyBatchItemRecord", "WeeklyBatchRecord", "RatingRecord", "WatchEntryRecord", "PendingMovie", "MovieRecord", "UserRecord", "AppSnapshot"');
      await prisma.appSnapshot.create({ data: { id: "main", data: JSON.parse(JSON.stringify(state)) } });
      await prisma.userRecord.createMany({ data: state.users });
      await prisma.movieRecord.createMany({ data: state.movies.map(movie => ({ id: movie.id, slug: movie.slug, data: JSON.parse(JSON.stringify(movie)) })) });
    } else {
      writeFileSync(join(directory, "runtime-state.json"), JSON.stringify(state));
    }
    store = await import("@/lib/store");
    if (backend === "database") {
      // Independent store/cache modules represent separate server instances.
      vi.resetModules();
      otherStore = await import("@/lib/store");
    } else otherStore = store;
  });

  afterEach(async () => {
    if (prisma) await prisma.$disconnect();
    prisma = undefined;
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  async function persisted() {
    if (!prisma) return JSON.parse(readFileSync(join(directory, "runtime-state.json"), "utf8")) as AppState;
    const snapshot = await prisma.appSnapshot.findUniqueOrThrow({ where: { id: "main" } });
    return { ...(snapshot.data as unknown as AppState),
      users: await prisma.userRecord.findMany(),
      pendingMovieIds: (await prisma.pendingMovie.findMany()).map(row => row.movieId),
      watchEntries: await prisma.watchEntryRecord.findMany(),
      ratings: await prisma.ratingRecord.findMany()
    };
  }

  it("keeps different users' ratings and every activity event", async () => {
    await Promise.all(state.movies.flatMap(movie => [
      store.upsertRating({ movieId: movie.id, userId: "alpha", score: 8 }),
      otherStore.upsertRating({ movieId: movie.id, userId: "beta", score: 6.25 })
    ]));
    const saved = await persisted();
    expect(saved.ratings).toHaveLength(16);
    expect(saved.activity).toHaveLength(16);
    expect(saved.ratings.filter(rating => rating.userId === "alpha").every(rating => rating.score === 8)).toBe(true);
  });

  it("keeps one rating when the same person saves repeatedly", async () => {
    await Promise.all([store, otherStore, store, otherStore].map((instance, index) =>
      instance.upsertRating({ movieId: state.movies[0].id, userId: "alpha", score: index + 5, comment: `Save ${index}` })
    ));
    const saved = await persisted();
    expect(saved.ratings).toHaveLength(1);
    expect(saved.activity).toHaveLength(4);
    expect(saved.ratings[0].comment).toBe(`Save ${saved.ratings[0].score - 5}`);
  });

  it.each([false, true])("never leaves a watched film pending (watch first: %s)", async (watchFirst) => {
    await Promise.all(state.movies.flatMap(movie => {
      const add = () => store.addPendingMovie(movie);
      const watch = () => otherStore.markMovieAsWatched(movie.id);
      return watchFirst ? [watch(), add()] : [add(), watch()];
    }));
    const saved = await persisted();
    expect(saved.watchEntries).toHaveLength(8);
    expect(saved.pendingMovieIds).toEqual([]);
  });

  it("treats repeated add and watch requests as idempotent", async () => {
    const movie = state.movies[0];
    const additions = await Promise.all([store.addPendingMovie(movie), otherStore.addPendingMovie(movie)]);
    expect(additions.map(result => result.status).sort()).toEqual(["added", "already_pending"]);
    const watches = await Promise.all([store.markMovieAsWatched(movie.id), otherStore.markMovieAsWatched(movie.id)]);
    expect(watches[0].id).toBe(watches[1].id);
    const saved = await persisted();
    expect(saved.watchEntries).toHaveLength(1);
    expect(saved.pendingMovieIds).toEqual([]);
    expect(saved.activity).toHaveLength(2);
  });

  it.each([false, true])("preserves a password reset alongside a profile edit (reset first: %s)", async (resetFirst) => {
    const password = "Changed-password-456";
    const reset = () => store.updateUserCredentialsByAdmin("admin", { userId: "alpha", username: "alpha", password });
    const edit = () => otherStore.updateUserProfile("alpha", { name: "Alpha Edited", username: "alpha" });
    await Promise.all(resetFirst ? [reset(), edit()] : [edit(), reset()]);
    const user = (await persisted()).users.find(user => user.id === "alpha")!;
    expect(user.name).toBe("Alpha Edited");
    expect(verifyPassword(password, user.passwordHash)).toBe(true);
    expect(verifyPassword(originalPassword, user.passwordHash)).toBe(false);
    expect(user.isAdmin).toBe(false);
  });

  it("rejects concurrent case-insensitive username collisions and remains usable", async () => {
    const results = await Promise.allSettled([
      store.updateUserProfile("alpha", { name: "Alpha", username: "shared_name" }),
      otherStore.updateUserProfile("beta", { name: "Beta", username: "SHARED_NAME" })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await persisted()).users.filter(user => user.username.toLowerCase() === "shared_name")).toHaveLength(1);
    await store.upsertRating({ movieId: state.movies[0].id, userId: "alpha", score: 8 });
    expect((await persisted()).ratings).toHaveLength(1);
  });

  it("rejects selecting a recommendation after another request marked it watched", async () => {
    const batch = await store.generateBatch();
    const movieId = batch.items[0].movieId;
    await otherStore.markMovieAsWatched(movieId);
    await expect(store.selectWeeklyMovie(batch.id, movieId)).rejects.toThrow("ya está vista");
  });

  it.runIf(backend === "database")("rolls back a profile write when snapshot persistence fails, then releases the lock", async () => {
    // NOT VALID preserves the existing snapshot but rejects its next update.
    // This injects a real database failure after the user row has been written.
    await prisma!.$executeRawUnsafe('ALTER TABLE "AppSnapshot" ADD CONSTRAINT fail_test_snapshot CHECK (id <> \'main\') NOT VALID');
    try {
      await expect(store.updateUserProfile("alpha", { name: "Must roll back", username: "alpha" }))
        .rejects.toMatchObject({ name: "StatePersistenceUnavailableError" });
      expect((await persisted()).users.find(user => user.id === "alpha")?.name).toBe("alpha");
      expect((await persisted()).activity).toEqual([]);
    } finally {
      await prisma!.$executeRawUnsafe('ALTER TABLE "AppSnapshot" DROP CONSTRAINT fail_test_snapshot');
    }
    await otherStore.updateUserProfile("alpha", { name: "Saved afterwards", username: "alpha" });
    expect((await persisted()).users.find(user => user.id === "alpha")?.name).toBe("Saved afterwards");
  });
});
