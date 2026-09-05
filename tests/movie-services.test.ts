import { afterEach, expect, it, vi } from "vitest";
import { seedState } from "@/lib/demo-data";
import type { AppState, Movie } from "@/lib/types";
import type { PersistMutation, StateMutationRunner } from "@/lib/state-persistence";
import { createMovieService } from "@/lib/movies/service";
import { hydrateMovie } from "@/lib/movies/metadata";
import { createRatingService } from "@/lib/ratings/service";
import { resolveMovieMetadata, searchMovies } from "@/lib/movie-provider";

vi.mock("@/lib/movie-provider", () => ({
  TMDB_METADATA_VERSION: 999,
  resolveMovieMetadata: vi.fn(),
  searchMovies: vi.fn()
}));
afterEach(() => vi.resetAllMocks());

function fixture() {
  const state = structuredClone(seedState);
  state.movies = [{ ...state.movies[0], id: "stored_movie", slug: "stored-film", sourceIds: { tmdb: "123" }, metadataVersion: 0 }];
  state.ratings = [];
  state.pendingMovieIds = [];
  state.watchEntries = [];
  state.activity = [];
  return state;
}

function services(state: AppState, beforeMutation = () => {}) {
  const persist = vi.fn<PersistMutation>().mockResolvedValue(undefined);
  const mutateState: StateMutationRunner = async action => {
    beforeMutation();
    return action(state, persist);
  };
  const common = {
    mutateState,
    getMovieById: (state: AppState, id: string) => state.movies.find(movie => movie.id === id) ?? null,
    addActivity: (state: AppState, entry: AppState["activity"][number]) => { state.activity.unshift(entry); },
    invalidateDerivedCaches: () => {}
  };
  const movies = createMovieService({
    ...common,
    loadAppState: async () => state,
    getMovieByTmdbId: (state, id) => state.movies.find(movie => movie.sourceIds?.tmdb === id) ?? null,
    getWatchEntryForMovieFromState: (state, id) => state.watchEntries.find(entry => entry.movieId === id) ?? null,
    getCurrentBatchFromState: () => null,
    getStateIndexes: state => ({ watchedMovieIdSet: new Set(state.watchEntries.map(entry => entry.movieId)), pendingMovieIdSet: new Set(state.pendingMovieIds) })
  });
  const ratings = createRatingService({
    ...common,
    findUserById: (state, id) => state.users.find(user => user.id === id) ?? null,
    getStateIndexes: state => ({ ratingByUserMovie: new Map(state.ratings.map(rating => [`${rating.userId}:${rating.movieId}`, rating])) })
  });
  return { movies, ratings, persist };
}

it("prepares metadata before mutation and respects a watch added while enrichment was pending", async () => {
  const state = fixture();
  let finishEnrichment!: (movie: Movie) => void;
  vi.mocked(resolveMovieMetadata).mockImplementation(() => new Promise(resolve => { finishEnrichment = resolve; }));
  const enterMutation = vi.fn();
  const { movies, persist } = services(state, enterMutation);
  const request = movies.addPendingMovie({ ...state.movies[0], id: "remote_movie" });
  expect(resolveMovieMetadata).toHaveBeenCalledOnce();
  expect(enterMutation).not.toHaveBeenCalled();

  state.watchEntries.push({ id: "concurrent_watch", movieId: state.movies[0].id, groupId: state.group.id });
  finishEnrichment(state.movies[0]);
  expect(await request).toMatchObject({ status: "already_watched", movie: { id: "stored_movie" } });
  expect(enterMutation).toHaveBeenCalledOnce();
  expect(state.pendingMovieIds).toEqual([]);
  expect(state.movies).toHaveLength(1);
  expect(persist).not.toHaveBeenCalled();
});

it("preserves local movie identity when metadata changes its title or remote identifier", async () => {
  const state = fixture();
  const movie = state.movies[0];
  vi.mocked(resolveMovieMetadata).mockResolvedValue({ ...movie, id: "remote", slug: "new-title", title: "New title", metadataVersion: 999 });
  expect(await hydrateMovie(state, movie)).toBe(true);
  expect(movie).toMatchObject({ id: "stored_movie", slug: "stored-film", title: "New title", metadataVersion: 999 });
});

it("reports collection status for remote search results using the stored movie identity", async () => {
  const state = fixture();
  state.pendingMovieIds = [state.movies[0].id];
  const remote = { ...state.movies[0], id: "remote_result", slug: "remote-title" };
  vi.mocked(searchMovies).mockResolvedValue([remote]);
  const { movies } = services(state);
  expect(await movies.movieSearch("film")).toMatchObject([{ id: "remote_result", collectionStatus: "already_pending" }]);
  state.watchEntries.push({ id: "watch", movieId: state.movies[0].id, groupId: state.group.id });
  expect(await movies.movieSearch("film")).toMatchObject([{ collectionStatus: "already_watched" }]);
});

it("keeps rating identity and accepts zero while rejecting invalid scores and oversized comments", async () => {
  const state = fixture();
  const { ratings, persist } = services(state);
  const input = { movieId: state.movies[0].id, userId: state.users[0].id, score: 8.25, comment: "  Primera nota  " };
  const first = await ratings.upsertRating(input);
  expect(first.comment).toBe("Primera nota");
  const second = await ratings.upsertRating({ ...input, score: 0, comment: "  " });
  expect(second).toMatchObject({ id: first.id, score: 0, comment: undefined });
  expect(state.ratings).toHaveLength(1);
  for (const score of [-0.25, 10.25, 8.1, NaN, Infinity]) {
    await expect(ratings.upsertRating({ ...input, score })).rejects.toThrow("incrementos de 0,25");
  }
  await expect(ratings.upsertRating({ ...input, comment: "x".repeat(1001) })).rejects.toThrow("1000 caracteres");
  expect(state.ratings[0].score).toBe(0);
  expect(persist).toHaveBeenCalledTimes(2);
});
