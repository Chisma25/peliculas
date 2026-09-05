import type { AppState, Movie, User, UserRating } from "@/lib/types";
import { getAvatarDeliveryUrl } from "@/lib/avatar-data";
import { average } from "@/lib/utils";

export type ProfileData = {
  user: User;
  ratingsCount: number;
  averageScore: number;
  topThree: Array<UserRating & { movie: Movie }>;
  bottomThree: Array<UserRating & { movie: Movie }>;
  bestScore: number;
  distribution: Array<{
    value: number;
    label: string;
    count: number;
    ratio: number;
    axisLabel: string;
  }>;
};

export type ProfileSummary = {
  ratingsCount: number;
  averageScore: number;
  bestScore: number;
};

type ProfileOverview = {
  topThree: Array<UserRating & { movie: Movie }>;
  bottomThree: Array<UserRating & { movie: Movie }>;
  distribution: ProfileData["distribution"];
};

function buildRatingDistribution(ratings: UserRating[]): ProfileOverview["distribution"] {
  const distributionStep = 0.5;
  const distributionBins = Array.from({ length: Math.floor(10 / distributionStep) + 1 }, (_, index) => ({
    value: Number((index * distributionStep).toFixed(1)),
    label: (index * distributionStep).toFixed(1),
    count: 0
  }));

  for (const rating of ratings) {
    const bucket = Math.max(0, Math.min(distributionBins.length - 1, Math.round(rating.score / distributionStep)));
    distributionBins[bucket].count += 1;
  }

  const maxDistributionCount = Math.max(...distributionBins.map((item) => item.count), 1);
  return distributionBins.map((item, index) => ({
    ...item,
    ratio: item.count / maxDistributionCount,
    axisLabel: index % 2 === 0 ? item.label : ""
  }));
}

export function buildProfileFromRatings(user: User, ratings: UserRating[], moviesById: Map<string, Movie>): ProfileData {
  const ratedMovies = ratings
    .map((rating) => ({
      ...rating,
      movie: moviesById.get(rating.movieId)
    }))
    .filter((rating): rating is UserRating & { movie: Movie } => Boolean(rating.movie));
  const topThree = [...ratedMovies].sort((left, right) => right.score - left.score || right.movie.year - left.movie.year).slice(0, 3);
  const bottomThree = [...ratedMovies].sort((left, right) => left.score - right.score || right.movie.year - left.movie.year).slice(0, 3);

  return {
    user,
    ratingsCount: ratings.length,
    averageScore: average(ratings.map((rating) => rating.score)),
    topThree,
    bottomThree,
    bestScore: ratings.reduce((best, rating) => Math.max(best, rating.score), 0) || topThree[0]?.score || 0,
    distribution: buildRatingDistribution(ratings)
  };
}

type ProfileDependencies = {
  getStateIndexes: (state: AppState) => {
    ratingsByUserId: Map<string, UserRating[]>;
    moviesById: Map<string, Movie>;
  };
  findUserById: (state: AppState, id: string) => User | null;
};

export function createProfileReader({ getStateIndexes, findUserById }: ProfileDependencies) {
  const profileDataCache = new WeakMap<AppState, Map<string, ProfileData | null>>();
  const profileSummaryCache = new WeakMap<AppState, Map<string, ProfileSummary>>();
  const profileOverviewCache = new WeakMap<AppState, Map<string, ProfileOverview>>();

  function getProfileSummaryFromState(state: AppState, userId: string): ProfileSummary {
    const cachedSummaries = profileSummaryCache.get(state);
    const cachedSummary = cachedSummaries?.get(userId);
    if (cachedSummary) {
      return cachedSummary;
    }

    const userRatings = getStateIndexes(state).ratingsByUserId.get(userId) ?? [];
    const summary = {
      ratingsCount: userRatings.length,
      averageScore: average(userRatings.map((rating) => rating.score)),
      bestScore: userRatings.reduce((best, rating) => Math.max(best, rating.score), 0)
    };

    const nextSummaries = cachedSummaries ?? new Map<string, ProfileSummary>();
    nextSummaries.set(userId, summary);
    profileSummaryCache.set(state, nextSummaries);

    return summary;
  }

  function getProfileOverviewFromState(state: AppState, userId: string): ProfileOverview {
    const cachedOverviews = profileOverviewCache.get(state);
    const cachedOverview = cachedOverviews?.get(userId);
    if (cachedOverview) {
      return cachedOverview;
    }

    const indexes = getStateIndexes(state);
    const ratedMovies = (indexes.ratingsByUserId.get(userId) ?? [])
      .map((rating) => ({
        ...rating,
        movie: indexes.moviesById.get(rating.movieId)
      }))
      .filter((rating): rating is UserRating & { movie: Movie } => Boolean(rating.movie));

    const topThree = [...ratedMovies].sort((left, right) => right.score - left.score || right.movie.year - left.movie.year).slice(0, 3);
    const bottomThree = [...ratedMovies].sort((left, right) => left.score - right.score || right.movie.year - left.movie.year).slice(0, 3);

    const distributionStep = 0.5;
    const distributionBins = Array.from({ length: Math.floor(10 / distributionStep) + 1 }, (_, index) => ({
      value: Number((index * distributionStep).toFixed(1)),
      label: (index * distributionStep).toFixed(1),
      count: 0
    }));

    for (const rating of ratedMovies) {
      const bucket = Math.max(0, Math.min(distributionBins.length - 1, Math.round(rating.score / distributionStep)));
      distributionBins[bucket].count += 1;
    }

    const maxDistributionCount = Math.max(...distributionBins.map((item) => item.count), 1);
    const overview = {
      topThree,
      bottomThree,
      distribution: distributionBins.map((item, index) => ({
        ...item,
        ratio: item.count / maxDistributionCount,
        axisLabel: index % 2 === 0 ? item.label : ""
      }))
    };

    const nextOverviews = cachedOverviews ?? new Map<string, ProfileOverview>();
    nextOverviews.set(userId, overview);
    profileOverviewCache.set(state, nextOverviews);

    return overview;
  }

  function buildProfileFromState(state: AppState, userId: string): ProfileData | null {
    const cachedProfiles = profileDataCache.get(state);
    if (cachedProfiles?.has(userId)) {
      return cachedProfiles.get(userId) ?? null;
    }

    const user = findUserById(state, userId);
    if (!user) {
      return null;
    }

    const summary = getProfileSummaryFromState(state, userId);
    const overview = getProfileOverviewFromState(state, userId);

    const profile = {
      user: {
        ...user,
        avatarUrl: user.avatarUrl ? getAvatarDeliveryUrl(user.id, user.avatarUrl) : undefined
      },
      ratingsCount: summary.ratingsCount,
      averageScore: summary.averageScore,
      topThree: overview.topThree,
      bottomThree: overview.bottomThree,
      bestScore: summary.bestScore || overview.topThree[0]?.score || 0,
      distribution: overview.distribution
    };

    const nextProfiles = cachedProfiles ?? new Map<string, ProfileData | null>();
    nextProfiles.set(userId, profile);
    profileDataCache.set(state, nextProfiles);

    return profile;
  }

  function invalidateProfileCaches(state: AppState) {
    profileDataCache.delete(state);
    profileSummaryCache.delete(state);
    profileOverviewCache.delete(state);
  }
  return { getProfileSummaryFromState, buildProfileFromState, invalidateProfileCaches };
}
