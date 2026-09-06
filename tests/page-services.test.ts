import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seedState } from "@/lib/demo-data";
import type { AppState, Movie } from "@/lib/types";

const provider = vi.hoisted(() => ({ upcoming: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/movie-provider", () => ({
  TMDB_METADATA_VERSION: 999,
  resolveMovieMetadata: async (movie: Movie) => movie,
  fetchUpcomingMovies: provider.upcoming
}));

let directory: string;
let state: AppState;
let store: typeof import("@/lib/store");

function fixture(): AppState {
  const state = structuredClone(seedState);
  state.users = state.users.slice(0, 2);
  state.group.memberIds = state.users.map(user => user.id);
  state.movies = Array.from({ length: 12 }, (_, index) => ({
    ...state.movies[0], id: `film_${index}`, slug: `film-${index}`, title: `Película ${index}`,
    year: 2020 + index, genres: [index === 2 ? "Comedia" : "Drama"],
    sourceIds: { tmdb: String(1000 + index) }, metadataVersion: 999,
    director: index === 4 ? "Director especial" : "Director", synopsis: "Sinopsis de prueba.",
    posterUrl: "https://example.invalid/poster.jpg", durationMinutes: 100
  }));
  state.pendingMovieIds = ["film_3", "film_4"];
  state.watchEntries = [0, 1, 2].map(index => ({
    id: `watch_${index}`, movieId: `film_${index}`, groupId: state.group.id,
    watchedOn: index === 2 ? undefined : `2026-08-0${3 - index}T12:00:00.000Z`
  }));
  state.ratings = [
    { id: "rating_zero", movieId: "film_0", userId: state.users[0].id, score: 0 },
    { id: "rating_high", movieId: "film_1", userId: state.users[0].id, score: 8.25 },
    { id: "rating_other", movieId: "film_0", userId: state.users[1].id, score: 6 }
  ];
  state.weeklyBatches = [];
  state.activity = [];
  return state;
}

beforeEach(async () => {
  vi.resetModules();
  provider.upcoming.mockReset();
  directory = mkdtempSync(join(tmpdir(), "cine-pages-"));
  vi.stubEnv("APP_DATA_DIR", directory);
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DIRECT_URL", "");
  state = fixture();
  writeFileSync(join(directory, "runtime-state.json"), JSON.stringify(state));
  store = await import("@/lib/store");
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith("cine-pages-")) {
    throw new Error("Unexpected test directory");
  }
  rmSync(directory, { recursive: true, force: true });
});

it("preserves history filters, pagination, missing dates and personal zero ratings", async () => {
  const userId = state.users[0].id;
  const history = await store.getViewedPageDataHydrated({ currentUserId: userId, sort: "mine-asc" });
  expect(history.pagedHistory.map(item => item.movie.id)).toEqual(["film_0", "film_1", "film_2"]);
  expect(history.pagedHistory.map(item => item.userRating)).toEqual([0, 8.25, undefined]);
  expect(history.pagedHistory[2].watchedOn).toBe("2026-03-14T17:09:52.000Z");
  const filtered = await store.getViewedPageDataHydrated({ currentUserId: userId, genre: " comedia ", search: " PELÍCULA ", year: "2022", page: 99, pageSize: 1 });
  expect(filtered).toMatchObject({ currentPage: 1, totalPages: 1, totalHistoryCount: 3, filteredHistoryCount: 1 });
  expect(filtered.pagedHistory[0].movie.id).toBe("film_2");
  expect(filtered.featuredHistory[0].movie.id).toBe("film_1");
  const empty = await store.getViewedPageDataHydrated({ search: "sin coincidencias", page: 99 });
  expect(empty).toMatchObject({ currentPage: 1, totalPages: 1, filteredHistoryCount: 0, pagedHistory: [] });
});

it("keeps personal detail caches separate and invalidates history, profile and group after a rating edit", async () => {
  const [alpha, beta] = state.users;
  expect((await store.getMovieDetailDataHydrated("film-0", alpha.id))?.myRating?.score).toBe(0);
  expect((await store.getMovieDetailDataHydrated("film-0", beta.id))?.myRating?.score).toBe(6);
  expect((await store.getViewedPageDataHydrated({})).featuredHistory[0].movie.id).toBe("film_1");
  expect((await store.getProfileDataHydrated(alpha.id))?.averageScore).toBe(4.125);
  await store.getGroupPageData();

  await store.upsertRating({ movieId: "film_1", userId: alpha.id, score: 2 });
  expect((await store.getViewedPageDataHydrated({})).featuredHistory[0].movie.id).toBe("film_0");
  expect((await store.getMovieDetailDataHydrated("film-1", alpha.id))?.myRating?.score).toBe(2);
  expect((await store.getProfileDataHydrated(alpha.id))?.averageScore).toBe(1);
  const group = await store.getGroupPageData();
  expect(group.members.find(item => item.member.id === alpha.id)?.profileSummary.averageScore).toBe(1);
});

it("filters pending by director and updates pending, history and dashboard after marking a view", async () => {
  const filtered = await store.getPendingPageDataHydrated({ search: " DIRECTOR ESPECIAL ", genre: " drama ", page: 99, pageSize: 1 });
  expect(filtered).toMatchObject({ currentPage: 1, totalPages: 1, totalPendingCount: 2, filteredPendingCount: 1 });
  expect(filtered.pagedPending[0].id).toBe("film_4");
  await store.getViewedPageDataHydrated({});
  await store.markMovieAsWatched("film_4", "2026-09-05T12:00:00.000Z");
  expect((await store.getPendingPageDataHydrated({})).pagedPending.map(movie => movie.id)).toEqual(["film_3"]);
  expect((await store.getViewedPageDataHydrated({})).totalHistoryCount).toBe(4);
  expect((await store.getDashboardOverviewHydrated()).stats).toMatchObject({ watchedCount: 4, pendingCount: 1 });
});

it.each([false, true])("refreshes an expired batch and only carries a selection that remains pending (watched: %s)", async watched => {
  state.weeklyBatches = [{ id: "expired_batch", groupId: state.group.id, weekOf: "2000-01-03T00:00:00.000Z", createdAt: "2000-01-03T12:00:00.000Z", selectedMovieId: "film_3", items: [] }];
  if (watched) {
    state.pendingMovieIds = ["film_4"];
    state.watchEntries.push({ id: "selected_watch", groupId: state.group.id, movieId: "film_3" });
  }
  writeFileSync(join(directory, "runtime-state.json"), JSON.stringify(state));
  const current = await store.getCurrentBatch();
  expect(current?.id).not.toBe("expired_batch");
  expect(current?.items).toHaveLength(3);
  expect(current?.selectedMovieId).toBe(watched ? undefined : "film_3");
  expect((await store.getCurrentBatch())?.id).toBe(current?.id);
  await expect(store.selectWeeklyMovie("expired_batch", "film_4")).rejects.toThrow("ya no es la actual");
});

it("invalidates upcoming suggestions when their movie is added to pending", async () => {
  const release = { ...state.movies[11], releaseDateEs: new Date(Date.now() + 2 * 86400000).toISOString(), releaseDate: undefined };
  provider.upcoming.mockResolvedValue([release]);
  expect((await store.getUpcomingDashboardReleasesHydrated()).map(item => item.movie.id)).toEqual([release.id]);
  await store.getUpcomingDashboardReleasesHydrated();
  expect(provider.upcoming).toHaveBeenCalledOnce();
  await store.addPendingMovie(release);
  expect(await store.getUpcomingDashboardReleasesHydrated()).toEqual([]);
  expect(provider.upcoming).toHaveBeenCalledTimes(2);
});

it.each([
  { first: [0], second: [8], expected: 4, scenario: "zero and positive movie averages" },
  { first: [0, 0], second: [8], expected: 4, scenario: "equal movie weights despite different rating counts" },
  { first: [], second: [8], expected: 8, scenario: "unrated watched movies" },
  { first: [0], second: [], expected: 0, scenario: "only zero ratings" },
  { first: [], second: [], expected: 0, scenario: "no rated watched movies" }
])("computes the dashboard group average with $scenario", async ({ first, second, expected }) => {
  state.ratings = [first, second, [], [10]].flatMap((scores, index) =>
    scores.map((score, userIndex) => ({
      id: `rating_${index}_${userIndex}`, movieId: `film_${index}`, userId: state.users[userIndex].id, score
    }))
  );
  writeFileSync(join(directory, "runtime-state.json"), JSON.stringify(state));

  // film_2 is watched without ratings; film_3 has a rating but is still pending.
  expect((await store.getDashboardOverviewHydrated()).stats).toMatchObject({
    watchedCount: 3, pendingCount: 2, averageScore: expected
  });
});

it("refreshes the dashboard average when a movie's last positive rating becomes zero", async () => {
  expect((await store.getDashboardOverviewHydrated()).stats.averageScore).toBe(5.625);
  await store.upsertRating({ movieId: "film_1", userId: state.users[0].id, score: 0 });
  expect((await store.getDashboardOverviewHydrated()).stats.averageScore).toBe(1.5);
});
