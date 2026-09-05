import { DashboardOverviewData } from "@/lib/pages/types";
import type { createSuggestionReader } from "@/lib/recommendations/suggestions";
import type { createStateReader } from "@/lib/state-readers";
import { AppState } from "@/lib/types";

type Dependencies = {
  getStateIndexes: ReturnType<typeof createStateReader>["getStateIndexes"];
  getCurrentBatchFromState: ReturnType<typeof createStateReader>["getCurrentBatchFromState"];
  getMovieById: ReturnType<typeof createStateReader>["getMovieById"];
  getWatchEntryForMovieFromState: ReturnType<typeof createStateReader>["getWatchEntryForMovieFromState"];
  loadAppState: () => Promise<AppState>;
  buildUpcomingDashboardReleases: ReturnType<typeof createSuggestionReader>["buildUpcomingDashboardReleases"];
  getUpcomingDashboardReleasesHydrated: ReturnType<typeof createSuggestionReader>["getUpcomingDashboardReleasesHydrated"];
};

export function createDashboardPageReader({
  getStateIndexes,
  getCurrentBatchFromState,
  getMovieById,
  getWatchEntryForMovieFromState,
  loadAppState,
  buildUpcomingDashboardReleases,
  getUpcomingDashboardReleasesHydrated
}: Dependencies) {
  function getGroupStatsFromState(state: AppState) {
    const { groupAverageScore } = getStateIndexes(state);
    return {
      watchedCount: state.watchEntries.length,
      averageScore: groupAverageScore,
      pendingCount: state.pendingMovieIds.length
    };
  }

  function buildDashboardDataFromState(state: AppState): DashboardOverviewData {
    const batch = getCurrentBatchFromState(state);
    const selectedMovie = batch?.selectedMovieId ? getMovieById(state, batch.selectedMovieId) : null;

    return {
      selectedMovie,
      selectedWatchEntry: batch?.selectedMovieId ? getWatchEntryForMovieFromState(state, batch.selectedMovieId) : null,
      stats: getGroupStatsFromState(state)
    };
  }

  async function getDashboardData() {
    const state = await loadAppState();
    return {
      ...(await getDashboardOverviewHydrated()),
      upcomingReleases: await buildUpcomingDashboardReleases(state)
    };
  }

  async function getDashboardOverviewHydrated() {
    const state = await loadAppState();
    return buildDashboardDataFromState(state);
  }

  async function getDashboardDataHydrated() {
    return {
      ...(await getDashboardOverviewHydrated()),
      upcomingReleases: await getUpcomingDashboardReleasesHydrated()
    };
  }

  return { getDashboardData, getDashboardOverviewHydrated, getDashboardDataHydrated };
}
