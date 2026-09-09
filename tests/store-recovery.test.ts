import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppState } from "@/lib/types";

const database = vi.hoisted(() => ({
  appSnapshot: { findUnique: vi.fn(), upsert: vi.fn() },
  userRecord: { findMany: vi.fn(), upsert: vi.fn() },
  movieRecord: { findMany: vi.fn(), upsert: vi.fn() },
  pendingMovie: { findMany: vi.fn(), deleteMany: vi.fn() },
  watchEntryRecord: { findMany: vi.fn(), deleteMany: vi.fn() },
  ratingRecord: { findMany: vi.fn(), deleteMany: vi.fn() },
  weeklyBatchRecord: { findMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn()
}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

let directory: string;
function localFixture(): AppState {
  return {
    users: [{ id: "local_user", name: "Local User", username: "local_user",
      email: "local@example.invalid", avatarSeed: "local", passwordHash: "old-hash", isAdmin: false }],
    group: { id: "group_cine_club", name: "Local group", memberIds: ["local_user"], accentColor: "#fff" },
    movies: [], pendingMovieIds: [], watchEntries: [], ratings: [], weeklyBatches: [], activity: []
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  directory = mkdtempSync(join(tmpdir(), "cine-recovery-"));
  vi.stubEnv("APP_DATA_DIR", directory);
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("DATABASE_ENVIRONMENT", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@database.example.invalid/test");
  vi.stubEnv("PRODUCTION_DATABASE_HOST", "database.example.invalid");
  database.appSnapshot.findUnique.mockResolvedValue(null);
  for (const table of [database.userRecord, database.movieRecord, database.pendingMovie,
    database.watchEntryRecord, database.ratingRecord, database.weeklyBatchRecord]) table.findMany.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

it("leaves a historical write queue untouched when reading the database", async () => {
  const historical = localFixture();
  const queuePath = join(directory, "runtime-write-queue.json");
  const queueContent = JSON.stringify([
    { type: "user-upsert", user: historical.users[0] },
    { type: "snapshot-backup", state: historical }
  ], null, 2);
  writeFileSync(queuePath, queueContent);
  const store = await import("@/lib/store");

  expect(await store.listHistory()).toEqual([]);
  expect(await store.listMembers()).toEqual([]);

  expect(database.userRecord.upsert).not.toHaveBeenCalled();
  expect(database.appSnapshot.upsert).not.toHaveBeenCalled();
  expect(database.$transaction).not.toHaveBeenCalled();
  expect(readFileSync(queuePath, "utf8")).toBe(queueContent);
});

it("uses local users only as a development read fallback without importing them after a query failure", async () => {
  vi.stubEnv("APP_ENV", "development");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("DATABASE_ENVIRONMENT", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/cine_recovery_mock");
  vi.stubEnv("PRODUCTION_DATABASE_HOST", "");
  const local = localFixture();
  const localPath = join(directory, "runtime-state.json");
  const localContent = JSON.stringify(local);
  writeFileSync(localPath, localContent);
  database.userRecord.findMany.mockRejectedValue(new Error("unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const store = await import("@/lib/store");
    expect((await store.getUserByUsername("local_user"))?.id).toBe("local_user");
    expect((await store.listMembers()).map(user => user.id)).toEqual(["local_user"]);
    expect(await store.listHistory()).toEqual([]);

    // A fresh server instance after recovery must use the actual empty
    // database, even though the development fallback remains on disk.
    database.userRecord.findMany.mockResolvedValue([]);
    vi.resetModules();
    const recoveredStore = await import("@/lib/store");
    expect(await recoveredStore.listMembers()).toEqual([]);
    expect(await recoveredStore.getUserByUsername("local_user")).toBeNull();
    expect(database.userRecord.upsert).not.toHaveBeenCalled();
    expect(database.movieRecord.upsert).not.toHaveBeenCalled();
    expect(database.ratingRecord.deleteMany).not.toHaveBeenCalled();
    expect(database.appSnapshot.upsert).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(readFileSync(localPath, "utf8")).toBe(localContent);
  } finally { log.mockRestore(); }
});

it("reads normalized users and an empty history when the aggregate snapshot is absent", async () => {
  database.userRecord.findMany.mockResolvedValue([{ id: "user_isma", name: "Isma", username: "Isma",
    email: "test@example.invalid", avatarSeed: "test", avatarUrl: null, passwordHash: "hash", isAdmin: false }]);
  const store = await import("@/lib/store");
  expect(await store.listHistory()).toEqual([]);
  const users = await store.listMembers();
  expect(users).toHaveLength(1);
  expect(users[0].isAdmin).toBe(false);
  expect(database.$transaction).not.toHaveBeenCalled();
  expect(database.appSnapshot.upsert).not.toHaveBeenCalled();
});

it("does not seed an empty database when both snapshot and normalized rows are absent", async () => {
  const store = await import("@/lib/store");
  expect(await store.listHistory()).toEqual([]);
  expect(await store.listMembers()).toEqual([]);
  expect(database.$transaction).not.toHaveBeenCalled();
  expect(database.userRecord.upsert).not.toHaveBeenCalled();
  expect(database.appSnapshot.upsert).not.toHaveBeenCalled();
});

it.each(["query failure", "malformed snapshot"])("fails closed on %s without repopulating tables", async (failure) => {
  const localPath = join(directory, "runtime-state.json");
  const localContent = JSON.stringify(localFixture());
  writeFileSync(localPath, localContent);
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    if (failure === "query failure") database.appSnapshot.findUnique.mockRejectedValue(new Error("unavailable"));
    else database.appSnapshot.findUnique.mockResolvedValue({ data: { invalid: true } });
    const store = await import("@/lib/store");
    await expect(store.listHistory()).rejects.toMatchObject({ code: "DATA_UNAVAILABLE" });
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(database.userRecord.upsert).not.toHaveBeenCalled();
    expect(database.appSnapshot.upsert).not.toHaveBeenCalled();
    expect(readFileSync(localPath, "utf8")).toBe(localContent);
  } finally { log.mockRestore(); }
});
