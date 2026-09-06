import { afterEach, expect, it, vi } from "vitest";
import { seedState } from "@/lib/demo-data";
import { createMovieMetadataWriter } from "@/lib/movies/metadata-writer";
import { resolveMovieMetadata } from "@/lib/movie-provider";
import type { Movie } from "@/lib/types";
import type { PersistMutation, StateMutationRunner } from "@/lib/state-persistence";

vi.mock("@/lib/movie-provider", () => ({ TMDB_METADATA_VERSION: 999, resolveMovieMetadata: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function fixture() {
  const state = structuredClone(seedState);
  state.movies = [{ ...state.movies[0], director: "Pendiente" }];
  const persist = vi.fn<PersistMutation>().mockResolvedValue(undefined);
  const entered = vi.fn();
  const mutateState: StateMutationRunner = async action => { entered(); return action(state, persist); };
  return { state, persist, entered, ...createMovieMetadataWriter({ mutateState, invalidateDerivedCaches: vi.fn() }) };
}

it("deduplicates page references and publishes metadata only after persistence completes", async () => {
  const { state, persist, hydrateMoviesForDatabaseRead } = fixture();
  const first = structuredClone(state.movies[0]);
  const second = structuredClone(first);
  vi.mocked(resolveMovieMetadata).mockResolvedValue({ ...first, director: "Enriched", id: "remote", slug: "remote" });
  let finish!: () => void;
  let entered!: () => void;
  const persisting = new Promise<void>(resolve => { entered = resolve; });
  persist.mockImplementation(async () => { entered(); await new Promise<void>(resolve => { finish = resolve; }); });
  const request = hydrateMoviesForDatabaseRead([first, second]);
  await persisting;
  expect(first.director).toBe("Pendiente");
  expect(second.director).toBe("Pendiente");
  finish();
  await request;
  expect(resolveMovieMetadata).toHaveBeenCalledOnce();
  expect(first).toEqual(second);
  expect(first).toMatchObject({ id: state.movies[0].id, slug: state.movies[0].slug, director: "Enriched" });
});

it("does not recreate a removed movie after a slow provider response", async () => {
  const { state, persist, entered, hydrateMoviesForDatabaseRead } = fixture();
  const pageMovie = structuredClone(state.movies[0]);
  let finish!: (movie: Movie) => void;
  vi.mocked(resolveMovieMetadata).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const request = hydrateMoviesForDatabaseRead([pageMovie]);
  expect(entered).not.toHaveBeenCalled();
  state.movies = [];
  finish({ ...pageMovie, director: "Too late" });
  await request;
  expect(state.movies).toEqual([]);
  expect(persist).not.toHaveBeenCalled();
  expect(pageMovie.director).toBe("Pendiente");
});

it("does not acquire a mutation lock when the provider has no metadata changes", async () => {
  const { state, entered, hydrateMoviesForDatabaseRead } = fixture();
  vi.mocked(resolveMovieMetadata).mockImplementation(async movie => movie);
  await hydrateMoviesForDatabaseRead(state.movies);
  expect(entered).not.toHaveBeenCalled();
});
