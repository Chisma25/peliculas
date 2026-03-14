import { AppState, Movie, RecommendationReason, WeeklyRecommendationBatch, WeeklyRecommendationItem } from "@/lib/types";
import { average, getMovieAverage, safeId, startOfWeek } from "@/lib/utils";

type Profile = {
  genre: Map<string, number>;
  director: Map<string, number>;
  cast: Map<string, number>;
  decade: Map<string, number>;
  targetDuration: number;
};

function updateWeight(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function buildProfile(state: AppState): Profile {
  const genre = new Map<string, number>();
  const director = new Map<string, number>();
  const cast = new Map<string, number>();
  const decade = new Map<string, number>();

  const durations = state.watchEntries
    .map((entry) => state.movies.find((movie) => movie.id === entry.movieId))
    .filter((movie): movie is Movie => Boolean(movie))
    .map((movie) => movie.durationMinutes);

  for (const rating of state.ratings) {
    const movie = state.movies.find((item) => item.id === rating.movieId);
    if (!movie) {
      continue;
    }

    const normalized = Math.max(0, rating.score - 5);
    for (const genreName of movie.genres) {
      updateWeight(genre, genreName, normalized);
    }

    updateWeight(director, movie.director, normalized);
    updateWeight(decade, `${Math.floor(movie.year / 10) * 10}s`, normalized);

    for (const castName of movie.cast.slice(0, 2)) {
      updateWeight(cast, castName, normalized * 0.65);
    }
  }

  return {
    genre,
    director,
    cast,
    decade,
    targetDuration: durations.length ? average(durations) : 120
  };
}

function buildReasons(movie: Movie, profile: Profile, score: number): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const bestGenre = movie.genres
    .map((genreName) => ({ genreName, weight: profile.genre.get(genreName) ?? 0 }))
    .sort((left, right) => right.weight - left.weight)[0];

  if (bestGenre && bestGenre.weight > 0) {
    reasons.push({
      label: "Afinidad",
      detail: `${bestGenre.genreName} es uno de los territorios mejor valorados por el grupo.`
    });
  }

  if ((profile.director.get(movie.director) ?? 0) > 0) {
    reasons.push({
      label: "Director",
      detail: `${movie.director} ya tiene buena respuesta dentro de vuestro historial.`
    });
  }

  const durationDelta = Math.abs(movie.durationMinutes - profile.targetDuration);
  if (durationDelta <= 25) {
    reasons.push({
      label: "Duración",
      detail: `${movie.durationMinutes} minutos, muy alineada con vuestra duración habitual.`
    });
  }

  reasons.push({
    label: "Valoración externa",
    detail: `${movie.externalRating.value} en ${movie.externalRating.source}.`
  });

  if (score > 85 && reasons.length < 4) {
    reasons.push({
      label: "Momento",
      detail: "Equilibra prestigio, accesibilidad y buen encaje para una sesión semanal compartida."
    });
  }

  return reasons.slice(0, 4);
}

function summarizeReasons(movie: Movie, reasons: RecommendationReason[]) {
  const parts = reasons.slice(0, 2).map((reason) => reason.detail.toLowerCase());
  return `${movie.title} entra por ${parts.join(" y ")}.`;
}

function scoreMovie(movie: Movie, profile: Profile, state: AppState, recentMovieIds: Set<string>) {
  const genreScore = movie.genres.reduce((sum, genreName) => sum + (profile.genre.get(genreName) ?? 0), 0);
  const directorScore = profile.director.get(movie.director) ?? 0;
  const castScore = movie.cast.slice(0, 2).reduce((sum, actor) => sum + (profile.cast.get(actor) ?? 0), 0);
  const decadeScore = profile.decade.get(`${Math.floor(movie.year / 10) * 10}s`) ?? 0;
  const durationPenalty = Math.abs(movie.durationMinutes - profile.targetDuration) * 0.08;
  const groupAverage = getMovieAverage(movie.id, state.ratings);
  const externalScore = Number.parseFloat(movie.externalRating.value.replace(/[^\d.]/g, "")) || 0;
  const freshnessPenalty = recentMovieIds.has(movie.id) ? 18 : 0;

  return genreScore * 3 + directorScore * 4 + castScore * 2 + decadeScore * 1.4 + groupAverage * 2 + externalScore * 0.18 - durationPenalty - freshnessPenalty;
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function normalizeRecommendationScore(score: number, allScores: number[]) {
  if (allScores.length === 0) {
    return 80;
  }

  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  if (Math.abs(maxScore - minScore) < 0.01) {
    return 80;
  }

  const normalized = (score - minScore) / (maxScore - minScore);
  return Math.round(68 + normalized * 29);
}

export function generateWeeklyRecommendations(state: AppState): WeeklyRecommendationBatch {
  const profile = buildProfile(state);
  const seenIds = new Set(state.watchEntries.map((entry) => entry.movieId));
  const pendingSet = new Set(state.pendingMovieIds);
  const previousBatch = [...state.weeklyBatches].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  const previousIds = new Set(previousBatch?.items.map((item) => item.movieId) ?? []);
  const pendingCandidates = state.movies.filter((movie) => pendingSet.has(movie.id) && !seenIds.has(movie.id));
  const candidates = pendingCandidates.length > 0 ? pendingCandidates : state.movies.filter((movie) => !seenIds.has(movie.id));

  const ranked = candidates
    .map((movie) => {
      const score = scoreMovie(movie, profile, state, previousIds);
      const reasons = buildReasons(movie, profile, score);
      return {
        movie,
        score,
        reasons
      };
    })
    .sort((left, right) => right.score - left.score);

  const picks: Array<{ movie: Movie; score: number; reasons: RecommendationReason[] }> = [];

  for (const candidate of ranked) {
    const sharesGenre = picks.some((pick) => pick.movie.genres.some((genre) => candidate.movie.genres.includes(genre)));
    const sameDirector = picks.some((pick) => pick.movie.director === candidate.movie.director);

    if (sharesGenre && sameDirector && picks.length < 2) {
      continue;
    }

    picks.push(candidate);
    if (picks.length === 5) {
      break;
    }
  }

  let finalPicks = picks.length === 5 ? picks : ranked.slice(0, 5);
  const finalIds = finalPicks.map((pick) => pick.movie.id);
  const previousOrderedIds = previousBatch?.items.map((item) => item.movieId) ?? [];

  if (ranked.length > 5 && previousBatch && sameIds(finalIds, previousOrderedIds)) {
    const freshAlternatives = ranked.filter((candidate) => !previousIds.has(candidate.movie.id)).slice(0, 5);
    if (freshAlternatives.length >= 3) {
      finalPicks = [...freshAlternatives, ...ranked.filter((candidate) => previousIds.has(candidate.movie.id))].slice(0, 5);
    }
  }

  const items: WeeklyRecommendationItem[] = finalPicks.map((pick) => ({
    id: safeId("rec", pick.movie.id),
    movieId: pick.movie.id,
    score: normalizeRecommendationScore(
      pick.score,
      ranked.map((candidate) => candidate.score)
    ),
    reasons: pick.reasons,
    summary: summarizeReasons(pick.movie, pick.reasons)
  }));

  return {
    id: safeId("batch", state.group.id),
    groupId: state.group.id,
    weekOf: startOfWeek().toISOString(),
    createdAt: new Date().toISOString(),
    items
  };
}
