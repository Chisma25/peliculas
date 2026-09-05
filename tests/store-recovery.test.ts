import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("DATABASE_ENVIRONMENT", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@database.example.invalid/test");
  vi.stubEnv("PRODUCTION_DATABASE_HOST", "database.example.invalid");
  database.appSnapshot.findUnique.mockResolvedValue(null);
  for (const table of [database.userRecord, database.movieRecord, database.pendingMovie,
    database.watchEntryRecord, database.ratingRecord, database.weeklyBatchRecord]) table.findMany.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

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
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    if (failure === "query failure") database.appSnapshot.findUnique.mockRejectedValue(new Error("unavailable"));
    else database.appSnapshot.findUnique.mockResolvedValue({ data: { invalid: true } });
    const store = await import("@/lib/store");
    await expect(store.listHistory()).rejects.toMatchObject({ code: "DATA_UNAVAILABLE" });
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(database.appSnapshot.upsert).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
