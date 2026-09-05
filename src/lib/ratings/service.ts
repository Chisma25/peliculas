import type { ActivityItem, AppState, Movie, User, UserRating } from "@/lib/types";
import type { StateMutationRunner } from "@/lib/state-persistence";
import { upsertRatingToDatabase } from "@/lib/ratings/records";
import { sanitizeComment } from "@/lib/user-input";
import { formatScore, isQuarterPointScore, safeId } from "@/lib/utils";

type RatingServiceDependencies = {
  mutateState: StateMutationRunner;
  findUserById: (state: AppState, userId: string) => User | null;
  getMovieById: (state: AppState, movieId: string) => Movie | null;
  getStateIndexes: (state: AppState) => { ratingByUserMovie: Map<string, UserRating> };
  addActivity: (state: AppState, entry: ActivityItem) => void;
  invalidateDerivedCaches: (state: AppState) => void;
};

export function createRatingService({
  mutateState, findUserById, getMovieById, getStateIndexes, addActivity, invalidateDerivedCaches
}: RatingServiceDependencies) {
  async function upsertRating(input: { movieId: string; userId: string; score: number; comment?: string }) {
    if (!isQuarterPointScore(input.score)) {
      throw new Error("La nota debe estar entre 0 y 10 y avanzar en incrementos de 0,25.");
    }

    return mutateState(async (state, persistStateChange) => {
      const comment = sanitizeComment(input.comment);
      const user = findUserById(state, input.userId);
      const movie = getMovieById(state, input.movieId);
      if (!user || !movie) {
        throw new Error("No se encontró la película o el miembro que quieres valorar.");
      }
      const ratingKey = `${input.userId}:${input.movieId}`;
      const existing = getStateIndexes(state).ratingByUserMovie.get(ratingKey);

      if (existing) {
        existing.score = input.score;
        existing.comment = comment;
      } else {
        state.ratings.push({
          id: safeId("rating", `${input.movieId}-${input.userId}`),
          movieId: input.movieId,
          userId: input.userId,
          score: input.score,
          comment
        });
      }

      addActivity(state, {
        type: "rated",
        label: `${user.name} puntuó ${movie.title} con un ${formatScore(input.score)}`,
        movieId: movie.id,
        userId: user.id,
        date: new Date().toISOString()
      });

      invalidateDerivedCaches(state);
      const nextRating = getStateIndexes(state).ratingByUserMovie.get(ratingKey) as UserRating;
      await persistStateChange(state, [
        {
          run: (client) => upsertRatingToDatabase(nextRating, client)
        }
      ]);
      return nextRating;
    });
  }

  return { upsertRating };
}
