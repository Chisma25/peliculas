import { generateWeeklyRecommendations, hasRecommendationMetadata } from "@/lib/recommendations";
import { insertWeeklyBatchToDatabase, updateWeeklyBatchSelectionInDatabase } from "@/lib/recommendations/records";
import type { StateMutationRunner } from "@/lib/state-persistence";
import type { createStateReader } from "@/lib/state-readers";
import { ActivityItem, AppState } from "@/lib/types";
import { classifyWeeklySelection, isWeeklyBatchCurrent, shouldCarryWeeklySelection } from "@/lib/weekly-selection";

type Dependencies = {
  getStateIndexes: ReturnType<typeof createStateReader>["getStateIndexes"];
  getMovieById: ReturnType<typeof createStateReader>["getMovieById"];
  getCurrentBatchFromState: ReturnType<typeof createStateReader>["getCurrentBatchFromState"];
  invalidateDerivedCaches: (state: AppState) => void;
  mutateState: StateMutationRunner;
  addActivity: (state: AppState, entry: ActivityItem) => void;
};

// Page refreshes and explicit mutations share the same coordinator and state.
export function createRecommendationService({
  getStateIndexes,
  getMovieById,
  getCurrentBatchFromState,
  invalidateDerivedCaches,
  mutateState,
  addActivity
}: Dependencies) {
  function isDashboardBatchValid(state: AppState, batch: AppState["weeklyBatches"][number] | null) {
    if (!batch || !isWeeklyBatchCurrent(batch) || batch.items.length !== 3) {
      return false;
    }

    const { watchedMovieIdSet, pendingMovieIdSet } = getStateIndexes(state);
    if (batch.selectedMovieId) {
      const selectedMovie = getMovieById(state, batch.selectedMovieId);
      const isSelectable =
        selectedMovie !== null &&
        hasRecommendationMetadata(selectedMovie) &&
        !watchedMovieIdSet.has(batch.selectedMovieId) &&
        (pendingMovieIdSet.has(batch.selectedMovieId) ||
          batch.items.some((item) => item.movieId === batch.selectedMovieId));
      if (!isSelectable) {
        return false;
      }
    }

    return batch.items.every((item) => {
      const movie = getMovieById(state, item.movieId);
      return (
        movie !== null &&
        hasRecommendationMetadata(movie) &&
        !watchedMovieIdSet.has(item.movieId) &&
        !pendingMovieIdSet.has(item.movieId) &&
        Array.isArray(item.metrics) &&
        item.metrics.length >= 4
      );
    });
  }

  async function ensureDashboardBatch(state: AppState) {
    const currentBatch = getCurrentBatchFromState(state);
    if (isDashboardBatchValid(state, currentBatch)) {
      return {
        batch: currentBatch,
        changed: false
      };
    }

    const refreshedBatch = generateWeeklyRecommendations(state);
    const selectedMovie = currentBatch?.selectedMovieId
      ? getMovieById(state, currentBatch.selectedMovieId)
      : null;
    if (
      currentBatch?.selectedMovieId &&
      selectedMovie &&
      hasRecommendationMetadata(selectedMovie) &&
      shouldCarryWeeklySelection(
        currentBatch,
        getStateIndexes(state).watchedMovieIdSet,
        getStateIndexes(state).pendingMovieIdSet
      )
    ) {
      refreshedBatch.selectedMovieId = currentBatch.selectedMovieId;
    }

    state.weeklyBatches.unshift(refreshedBatch);
    invalidateDerivedCaches(state);
    return {
      batch: refreshedBatch,
      changed: true
    };
  }

  async function loadStateWithCurrentBatch() {
    return mutateState(async (state, persistStateChange) => {
      const { batch, changed } = await ensureDashboardBatch(state);
      if (changed && batch) {
        await persistStateChange(state, [
          {
            run: (client) => insertWeeklyBatchToDatabase(batch, client)
          }
        ]);
      }
      return state;
    });
  }

  async function getCurrentBatch() {
    return getCurrentBatchFromState(await loadStateWithCurrentBatch());
  }

  async function generateBatch() {
    return mutateState(async (state, persistStateChange) => {
      const currentBatch = getCurrentBatchFromState(state);
      const batch = generateWeeklyRecommendations(state);
      const selectedMovie = currentBatch?.selectedMovieId
        ? getMovieById(state, currentBatch.selectedMovieId)
        : null;
      if (
        currentBatch?.selectedMovieId &&
        selectedMovie &&
        hasRecommendationMetadata(selectedMovie) &&
        shouldCarryWeeklySelection(
          currentBatch,
          getStateIndexes(state).watchedMovieIdSet,
          getStateIndexes(state).pendingMovieIdSet
        )
      ) {
        batch.selectedMovieId = currentBatch.selectedMovieId;
      }
      state.weeklyBatches.unshift(batch);
      addActivity(state, {
        type: "recommended",
        label: "Se generó una nueva tanda de recomendaciones para esta semana",
        date: batch.createdAt
      });
      invalidateDerivedCaches(state);
      await persistStateChange(state, [
        {
          run: (client) => insertWeeklyBatchToDatabase(batch, client)
        }
      ]);
      return batch;
    });
  }

  async function selectWeeklyMovie(batchId: string, movieId: string) {
    return mutateState(async (state, persistStateChange) => {
      const batch = getStateIndexes(state).weeklyBatchById.get(batchId);
      if (!batch) {
        throw new Error("No se encontró la tanda semanal.");
      }

      const currentBatch = getCurrentBatchFromState(state);
      if (currentBatch?.id !== batch.id) {
        throw new Error("La tanda semanal ya no es la actual. Recarga la página para continuar.");
      }

      const movie = getMovieById(state, movieId);
      if (!movie) {
        throw new Error("No se encontró la película.");
      }
      if (!hasRecommendationMetadata(movie)) {
        throw new Error("La película necesita título, año y género válidos antes de poder elegirla.");
      }
      if (getStateIndexes(state).watchedMovieIdSet.has(movieId)) {
        throw new Error("Esa película ya está vista. Recarga la página para elegir otra.");
      }

      const selectionSource = classifyWeeklySelection(
        batch,
        getStateIndexes(state).pendingMovieIdSet,
        movieId
      );
      if (!selectionSource) {
        throw new Error("Solo puedes elegir una recomendación de la tanda o cualquier película de Pendientes.");
      }

      batch.selectedMovieId = movieId;
      addActivity(state, {
        type: "recommended",
        label: `La película de la semana pasó a ser ${movie.title}`,
        movieId: movie.id,
        date: new Date().toISOString()
      });

      invalidateDerivedCaches(state);
      await persistStateChange(state, [
        {
          run: (client) => updateWeeklyBatchSelectionInDatabase(batch.id, batch.selectedMovieId, client)
        }
      ]);
      return batch;
    });
  }

  return { loadStateWithCurrentBatch, getCurrentBatch, generateBatch, selectWeeklyMovie };
}
