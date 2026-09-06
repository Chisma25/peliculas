import { isDeepStrictEqual } from "node:util";
import { resolveMovieMetadata } from "@/lib/movie-provider";
import { movieNeedsHydration } from "@/lib/movies/metadata";
import { upsertMovieToDatabase } from "@/lib/movies/records";
import { cloneState } from "@/lib/state-cache";
import type { StateMutationRunner } from "@/lib/state-persistence";
import type { AppState, Movie } from "@/lib/types";

export function createMovieMetadataWriter({ mutateState, invalidateDerivedCaches }: {
  mutateState: StateMutationRunner;
  invalidateDerivedCaches: (state: AppState) => void;
}) {
  async function hydrateMoviesForDatabaseRead(movies: Movie[]) {
    const uniqueMovies = [...new Map(movies.map(movie => [movie.id, movie])).values()];
    // Network work uses detached copies before taking the shared database lock.
    const prepared = await Promise.all(uniqueMovies.filter(movieNeedsHydration).map(async movie => {
      const before = cloneState(movie);
      const enriched = await resolveMovieMetadata(cloneState(before));
      const after = { ...before, ...enriched, id: before.id, slug: before.slug };
      return { before, after };
    }));
    const changes = prepared.filter(({ before, after }) => !isDeepStrictEqual(before, after));
    if (changes.length === 0) return;

    const committed = await mutateState(async (state, persist) => {
      const currentById = new Map(state.movies.map(movie => [movie.id, movie]));
      const updated: Movie[] = [];
      const result = new Map<string, Movie>();
      for (const { before, after } of changes) {
        const current = currentById.get(before.id);
        // A slow response must not overwrite newer metadata or recreate a movie
        // removed since the page loaded. The next read can retry enrichment.
        if (!current) continue;
        if (isDeepStrictEqual(current, before)) {
          Object.assign(current, after);
          updated.push(current);
        }
        result.set(current.id, cloneState(current));
      }
      if (updated.length > 0) {
        invalidateDerivedCaches(state);
        await persist(state, updated.map(movie => ({ run: client => upsertMovieToDatabase(movie, client) })));
      }
      return result;
    });

    // Page objects only receive metadata after commit, including every duplicate
    // reference shared by the featured movie and the paginated list.
    for (const movie of movies) {
      const current = committed.get(movie.id);
      if (current) {
        for (const key of Object.keys(movie)) delete (movie as unknown as Record<string, unknown>)[key];
        Object.assign(movie, cloneState(current));
      }
    }
  }

  return { hydrateMoviesForDatabaseRead };
}
