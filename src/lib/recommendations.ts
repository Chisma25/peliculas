import { AppState, Movie, RecommendationReason, UserRating, WeeklyRecommendationBatch, WeeklyRecommendationItem } from "@/lib/types";
import { average, safeId, startOfWeek } from "@/lib/utils";

type FeatureMap = Map<string, number>;
type CountMap = Map<string, number>;

type TasteProfile = {
  genre: FeatureMap;
  director: FeatureMap;
  cast: FeatureMap;
  decade: FeatureMap;
  language: FeatureMap;
  country: FeatureMap;
  tokens: FeatureMap;
  historyGenreCount: CountMap;
  historyDirectorCount: CountMap;
  historyCountryCount: CountMap;
  targetDuration: number;
  durationTolerance: number;
  ratingsCount: number;
};

type CandidateMode = "discovery" | "pending";

type ReasonSignal = {
  label: string;
  detail: string;
  weight: number;
};

type ScoredCandidate = {
  movie: Movie;
  score: number;
  reasons: RecommendationReason[];
  summary: string;
};

const DISCOVERY_COUNT = 3;
const PENDING_COUNT = 5;
const TOKEN_STOPWORDS = new Set([
  "about",
  "ademas",
  "algo",
  "algun",
  "alguna",
  "algunas",
  "algunos",
  "ante",
  "aquel",
  "aquella",
  "aquellas",
  "aquello",
  "aquellos",
  "aqui",
  "como",
  "con",
  "contra",
  "desde",
  "donde",
  "durante",
  "ellos",
  "ellas",
  "entre",
  "esta",
  "estaba",
  "estado",
  "estar",
  "estas",
  "este",
  "esto",
  "estos",
  "hacia",
  "hasta",
  "into",
  "mientras",
  "mucho",
  "muchos",
  "para",
  "pero",
  "poco",
  "porque",
  "sobre",
  "solo",
  "tanto",
  "their",
  "them",
  "then",
  "they",
  "through",
  "tras",
  "una",
  "unas",
  "unos",
  "when",
  "where",
  "with",
  "your"
]);

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4 && !TOKEN_STOPWORDS.has(token));
}

function updateWeight(map: FeatureMap, key: string, value: number) {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    return;
  }

  map.set(normalizedKey, (map.get(normalizedKey) ?? 0) + value);
}

function updateCount(map: CountMap, key: string) {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    return;
  }

  map.set(normalizedKey, (map.get(normalizedKey) ?? 0) + 1);
}

function getMovieDecade(movie: Movie) {
  return `${Math.floor(movie.year / 10) * 10}s`;
}

function getMovieById(state: AppState, movieId: string) {
  return state.movies.find((movie) => movie.id === movieId) ?? null;
}

function getRatingsForMovie(state: AppState, movieId: string) {
  return state.ratings.filter((rating) => rating.movieId === movieId);
}

function parseExternalRating(movie: Movie) {
  const raw = movie.externalRating.value.trim();
  const number = Number.parseFloat(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number)) {
    return 70;
  }

  if (movie.externalRating.source === "IMDb" && raw.includes("/10")) {
    return Math.max(0, Math.min(100, number * 10));
  }

  if (movie.externalRating.source === "Metacritic") {
    return Math.max(0, Math.min(100, number));
  }

  return Math.max(0, Math.min(100, number));
}

function createEmptyProfile(): TasteProfile {
  return {
    genre: new Map(),
    director: new Map(),
    cast: new Map(),
    decade: new Map(),
    language: new Map(),
    country: new Map(),
    tokens: new Map(),
    historyGenreCount: new Map(),
    historyDirectorCount: new Map(),
    historyCountryCount: new Map(),
    targetDuration: 120,
    durationTolerance: 24,
    ratingsCount: 0
  };
}

function buildTasteProfile(ratings: UserRating[], state: AppState): TasteProfile {
  const profile = createEmptyProfile();
  if (ratings.length === 0) {
    return profile;
  }

  const meanScore = average(ratings.map((rating) => rating.score));
  const positiveDurations: Array<{ duration: number; weight: number }> = [];
  const ratedMovies: Movie[] = [];

  for (const rating of ratings) {
    const movie = getMovieById(state, rating.movieId);
    if (!movie) {
      continue;
    }

    ratedMovies.push(movie);
    const centered = rating.score - meanScore;
    const absolute = rating.score - 6.5;
    const weight = centered * 0.7 + absolute * 0.9;

    for (const genre of movie.genres) {
      updateWeight(profile.genre, genre, weight * 1.8);
      updateCount(profile.historyGenreCount, genre);
    }

    updateWeight(profile.director, movie.director, weight * 1.45);
    updateCount(profile.historyDirectorCount, movie.director);
    updateWeight(profile.decade, getMovieDecade(movie), weight * 0.9);
    updateWeight(profile.language, movie.language, weight * 0.7);
    updateWeight(profile.country, movie.country, weight * 0.55);
    updateCount(profile.historyCountryCount, movie.country);

    for (const castName of movie.cast.slice(0, 3)) {
      updateWeight(profile.cast, castName, weight * 0.9);
    }

    const tokenWeight = Math.max(-1.2, Math.min(1.8, weight * 0.18));
    for (const token of new Set(tokenize(`${movie.title} ${movie.synopsis} ${movie.genres.join(" ")} ${movie.director} ${movie.cast.join(" ")}`))) {
      updateWeight(profile.tokens, token, tokenWeight);
    }

    if (rating.score >= meanScore) {
      positiveDurations.push({
        duration: movie.durationMinutes,
        weight: Math.max(0.75, rating.score - meanScore + 1)
      });
    }
  }

  if (positiveDurations.length > 0) {
    const totalWeight = positiveDurations.reduce((sum, entry) => sum + entry.weight, 0);
    profile.targetDuration = positiveDurations.reduce((sum, entry) => sum + entry.duration * entry.weight, 0) / totalWeight;
    const variance =
      positiveDurations.reduce((sum, entry) => sum + entry.weight * Math.pow(entry.duration - profile.targetDuration, 2), 0) / totalWeight;
    profile.durationTolerance = Math.max(18, Math.min(50, Math.sqrt(variance)));
  } else if (ratedMovies.length > 0) {
    profile.targetDuration = average(ratedMovies.map((movie) => movie.durationMinutes));
    profile.durationTolerance = 28;
  }

  profile.ratingsCount = ratings.length;
  return profile;
}

function mergeProfiles(profiles: TasteProfile[]): TasteProfile {
  if (profiles.length === 0) {
    return createEmptyProfile();
  }

  const merged = createEmptyProfile();

  for (const profile of profiles) {
    for (const [key, value] of profile.genre) {
      updateWeight(merged.genre, key, value);
    }
    for (const [key, value] of profile.director) {
      updateWeight(merged.director, key, value);
    }
    for (const [key, value] of profile.cast) {
      updateWeight(merged.cast, key, value);
    }
    for (const [key, value] of profile.decade) {
      updateWeight(merged.decade, key, value);
    }
    for (const [key, value] of profile.language) {
      updateWeight(merged.language, key, value);
    }
    for (const [key, value] of profile.country) {
      updateWeight(merged.country, key, value);
    }
    for (const [key, value] of profile.tokens) {
      updateWeight(merged.tokens, key, value);
    }
    for (const [key, value] of profile.historyGenreCount) {
      merged.historyGenreCount.set(key, (merged.historyGenreCount.get(key) ?? 0) + value);
    }
    for (const [key, value] of profile.historyDirectorCount) {
      merged.historyDirectorCount.set(key, (merged.historyDirectorCount.get(key) ?? 0) + value);
    }
    for (const [key, value] of profile.historyCountryCount) {
      merged.historyCountryCount.set(key, (merged.historyCountryCount.get(key) ?? 0) + value);
    }
  }

  const count = profiles.length;
  merged.targetDuration = average(profiles.map((profile) => profile.targetDuration));
  merged.durationTolerance = average(profiles.map((profile) => profile.durationTolerance));
  merged.ratingsCount = profiles.reduce((sum, profile) => sum + profile.ratingsCount, 0);

  for (const featureMap of [merged.genre, merged.director, merged.cast, merged.decade, merged.language, merged.country, merged.tokens]) {
    for (const [key, value] of featureMap) {
      featureMap.set(key, value / count);
    }
  }

  return merged;
}

function buildProfiles(state: AppState) {
  const userProfiles = listGroupUsers(state)
    .map((user) => buildTasteProfile(state.ratings.filter((rating) => rating.userId === user.id), state))
    .filter((profile) => profile.ratingsCount > 0);

  return {
    userProfiles,
    groupProfile: mergeProfiles(userProfiles)
  };
}

function listGroupUsers(state: AppState) {
  return state.group.memberIds
    .map((userId) => state.users.find((user) => user.id === userId))
    .filter((user): user is AppState["users"][number] => Boolean(user));
}

function getMapAverage(map: FeatureMap, keys: string[]) {
  const normalizedKeys = keys.map((key) => key.trim()).filter(Boolean);
  if (normalizedKeys.length === 0) {
    return 0;
  }

  return normalizedKeys.reduce((sum, key) => sum + (map.get(key) ?? 0), 0) / normalizedKeys.length;
}

function getTokenAffinity(movie: Movie, profile: TasteProfile) {
  const tokens = new Set(tokenize(`${movie.title} ${movie.synopsis} ${movie.genres.join(" ")} ${movie.director} ${movie.cast.join(" ")}`));
  if (tokens.size === 0) {
    return 0;
  }

  return [...tokens].reduce((sum, token) => sum + (profile.tokens.get(token) ?? 0), 0) / Math.sqrt(tokens.size);
}

function scoreProfileAgainstMovie(movie: Movie, profile: TasteProfile) {
  const genreAffinity = getMapAverage(profile.genre, movie.genres);
  const castAffinity = getMapAverage(profile.cast, movie.cast.slice(0, 3));
  const directorAffinity = profile.director.get(movie.director) ?? 0;
  const decadeAffinity = profile.decade.get(getMovieDecade(movie)) ?? 0;
  const languageAffinity = profile.language.get(movie.language) ?? 0;
  const countryAffinity = profile.country.get(movie.country) ?? 0;
  const tokenAffinity = getTokenAffinity(movie, profile);

  return genreAffinity * 1.8 + directorAffinity * 1.45 + castAffinity * 1.05 + decadeAffinity * 0.8 + languageAffinity * 0.65 + countryAffinity * 0.55 + tokenAffinity * 1.15;
}

function getDurationFit(movie: Movie, profile: TasteProfile) {
  const delta = Math.abs(movie.durationMinutes - profile.targetDuration);
  if (delta <= profile.durationTolerance) {
    return 6;
  }

  const overflow = delta - profile.durationTolerance;
  return Math.max(-4, 6 - overflow / 8);
}

function getNoveltyScore(movie: Movie, profile: TasteProfile, mode: CandidateMode) {
  const genreFreshness = average(movie.genres.map((genre) => 1 / ((profile.historyGenreCount.get(genre) ?? 0) + 1)));
  const unseenDirectorBonus = (profile.historyDirectorCount.get(movie.director) ?? 0) === 0 ? 0.9 : 0;
  const unseenCountryBonus = (profile.historyCountryCount.get(movie.country) ?? 0) === 0 ? 0.5 : 0;
  const discoveryMultiplier = mode === "discovery" ? 1.25 : 0.75;

  return (genreFreshness * 4.2 + unseenDirectorBonus + unseenCountryBonus) * discoveryMultiplier;
}

function getWeeklyWatchability(movie: Movie, groupProfile: TasteProfile, mode: CandidateMode) {
  const quality = parseExternalRating(movie);
  const durationFit = getDurationFit(movie, groupProfile);
  const runtimePenalty = movie.durationMinutes > 170 ? 2.2 : movie.durationMinutes > 150 ? 1.2 : 0;
  const shortNightBonus = movie.durationMinutes <= 130 ? 1.4 : movie.durationMinutes <= 150 ? 0.5 : 0;
  const modeBonus = mode === "pending" ? 1.1 : 0.35;

  return durationFit + shortNightBonus + modeBonus + (quality - 70) / 12 - runtimePenalty;
}

function getPredictionMetrics(movie: Movie, userProfiles: TasteProfile[]) {
  const predictions = userProfiles.map((profile) => scoreProfileAgainstMovie(movie, profile));
  if (predictions.length === 0) {
    return {
      averagePrediction: 0,
      disagreementPenalty: 0
    };
  }

  const averagePrediction = average(predictions);
  const variance = average(predictions.map((value) => Math.pow(value - averagePrediction, 2)));

  return {
    averagePrediction,
    disagreementPenalty: Math.sqrt(variance)
  };
}

function buildReasonSignals(movie: Movie, profile: TasteProfile, mode: CandidateMode, metrics: {
  averagePrediction: number;
  quality: number;
  weeklyWatchability: number;
  novelty: number;
}) {
  const signals: ReasonSignal[] = [];

  const topGenre = movie.genres
    .map((genre) => ({ genre, weight: profile.genre.get(genre) ?? 0 }))
    .sort((left, right) => right.weight - left.weight)[0];
  if (topGenre && topGenre.weight > 0.35) {
    signals.push({
      label: "Género",
      detail: `recoge vuestro gusto por el ${topGenre.genre.toLowerCase()}`,
      weight: topGenre.weight
    });
  }

  const directorWeight = profile.director.get(movie.director) ?? 0;
  if (directorWeight > 0.4) {
    signals.push({
      label: "Director",
      detail: `${movie.director} os suele funcionar bastante bien`,
      weight: directorWeight
    });
  }

  const castMatch = movie.cast
    .map((castName) => ({ castName, weight: profile.cast.get(castName) ?? 0 }))
    .sort((left, right) => right.weight - left.weight)[0];
  if (castMatch && castMatch.weight > 0.3) {
    signals.push({
      label: "Reparto",
      detail: `vuelve a tocar una zona de confort con ${castMatch.castName}`,
      weight: castMatch.weight
    });
  }

  if (metrics.weeklyWatchability > 4.8) {
    signals.push({
      label: "Plan de grupo",
      detail:
        mode === "pending"
          ? "encaja muy bien como peli de esta semana por duración y accesibilidad"
          : "tiene muy buena pinta para una sesión de grupo sin hacerse cuesta arriba",
      weight: metrics.weeklyWatchability
    });
  }

  if (metrics.quality >= 82) {
    signals.push({
      label: "Calidad",
      detail: `viene respaldada por una nota externa sólida de ${Math.round(metrics.quality)} sobre 100`,
      weight: metrics.quality / 18
    });
  }

  if (metrics.novelty > 3.8) {
    signals.push({
      label: "Variedad",
      detail:
        mode === "discovery"
          ? "os saca un poco del carril habitual sin alejarse demasiado de lo que mejor valoráis"
          : "añade una opción distinta dentro de pendientes sin parecer una apuesta random",
      weight: metrics.novelty
    });
  }

  if (metrics.averagePrediction > 1.8) {
    signals.push({
      label: "Consenso",
      detail: "parece de esas pelis que pueden reunir bastante bien los gustos del grupo",
      weight: metrics.averagePrediction
    });
  }

  return signals
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3);
}

function signalsToReasons(signals: ReasonSignal[]): RecommendationReason[] {
  return signals.map((signal) => ({
    label: signal.label,
    detail: `${signal.detail.charAt(0).toUpperCase()}${signal.detail.slice(1)}.`
  }));
}

function summarizeSignals(signals: ReasonSignal[], movie: Movie, mode: CandidateMode) {
  if (signals.length === 0) {
    return mode === "pending"
      ? `${movie.title} puede ser una buena elección porque ya la tenéis a mano y encaja bien para una semana normal.`
      : `${movie.title} puede ser un descubrimiento interesante para el grupo sin pisar lo que ya tenéis en pendientes.`;
  }

  const [first, second] = signals;
  if (!second) {
    return `${movie.title} entra porque ${first.detail}.`;
  }

  return `${movie.title} entra porque ${first.detail}, y además ${second.detail}.`;
}

function normalizeRecommendationScore(score: number, allScores: number[], mode: CandidateMode) {
  if (allScores.length === 0) {
    return mode === "pending" ? 86 : 84;
  }

  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  if (Math.abs(maxScore - minScore) < 0.01) {
    return mode === "pending" ? 88 : 85;
  }

  const normalized = (score - minScore) / (maxScore - minScore);
  const floor = mode === "pending" ? 76 : 73;
  const spread = mode === "pending" ? 21 : 18;
  return Math.round(floor + normalized * spread);
}

function scoreMovie(movie: Movie, state: AppState, mode: CandidateMode, previousIds: Set<string>, profiles: ReturnType<typeof buildProfiles>) {
  const quality = parseExternalRating(movie);
  const groupAffinity = scoreProfileAgainstMovie(movie, profiles.groupProfile);
  const { averagePrediction, disagreementPenalty } = getPredictionMetrics(movie, profiles.userProfiles);
  const novelty = getNoveltyScore(movie, profiles.groupProfile, mode);
  const weeklyWatchability = getWeeklyWatchability(movie, profiles.groupProfile, mode);
  const qualityLift = (quality - 70) / 3.8;
  const freshnessPenalty = previousIds.has(movie.id) ? 4.8 : 0;
  const pendingBonus = mode === "pending" ? 1.8 : 0;
  const discoveryBonus = mode === "discovery" ? novelty * 0.55 : 0;

  const score =
    groupAffinity * 2.35 +
    averagePrediction * 2.65 +
    weeklyWatchability * 1.6 +
    qualityLift * 1.35 +
    novelty * 0.9 +
    pendingBonus +
    discoveryBonus -
    disagreementPenalty * 0.85 -
    freshnessPenalty;

  const reasonSignals = buildReasonSignals(movie, profiles.groupProfile, mode, {
    averagePrediction,
    quality,
    weeklyWatchability,
    novelty
  });

  return {
    movie,
    score,
    reasons: signalsToReasons(reasonSignals),
    summary: summarizeSignals(reasonSignals, movie, mode)
  };
}

function overlapPenalty(candidate: Movie, selected: Movie[]) {
  return selected.reduce((penalty, movie) => {
    const sharedGenres = movie.genres.filter((genre) => candidate.genres.includes(genre)).length;
    const sharedCast = movie.cast.filter((castName) => candidate.cast.includes(castName)).length;

    return (
      penalty +
      (movie.director === candidate.director ? 5.5 : 0) +
      sharedGenres * 1.45 +
      (movie.country === candidate.country ? 0.85 : 0) +
      (getMovieDecade(movie) === getMovieDecade(candidate) ? 0.75 : 0) +
      sharedCast * 0.8
    );
  }, 0);
}

function pickDiverseCandidates(candidates: ScoredCandidate[], limit: number, mode: CandidateMode) {
  const picked: ScoredCandidate[] = [];
  const remaining = [...candidates];

  while (picked.length < limit && remaining.length > 0) {
    const best = remaining
      .map((candidate) => ({
        candidate,
        adjustedScore: candidate.score - overlapPenalty(candidate.movie, picked.map((item) => item.movie)) * (mode === "discovery" ? 1.15 : 0.95)
      }))
      .sort((left, right) => right.adjustedScore - left.adjustedScore)[0];

    picked.push(best.candidate);
    const index = remaining.findIndex((candidate) => candidate.movie.id === best.candidate.movie.id);
    remaining.splice(index, 1);
  }

  return picked;
}

function buildItems(scored: ScoredCandidate[], mode: CandidateMode) {
  const scores = scored.map((candidate) => candidate.score);
  return scored.map<WeeklyRecommendationItem>((candidate) => ({
    id: safeId(mode === "pending" ? "pending_rec" : "rec", candidate.movie.id),
    movieId: candidate.movie.id,
    score: normalizeRecommendationScore(candidate.score, scores, mode),
    summary: candidate.summary,
    reasons: candidate.reasons
  }));
}

function rankCandidates(state: AppState, mode: CandidateMode) {
  const seenIds = new Set(state.watchEntries.map((entry) => entry.movieId));
  const pendingIds = new Set(state.pendingMovieIds);
  const previousBatch = [...state.weeklyBatches].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  const previousIds = new Set(previousBatch?.items.map((item) => item.movieId) ?? []);
  const profiles = buildProfiles(state);

  const baseCandidates = state.movies.filter((movie) => {
    if (seenIds.has(movie.id)) {
      return false;
    }

    if (mode === "discovery") {
      return !pendingIds.has(movie.id);
    }

    return pendingIds.has(movie.id);
  });

  return baseCandidates
    .map((movie) => scoreMovie(movie, state, mode, previousIds, profiles))
    .sort((left, right) => right.score - left.score);
}

export function generateWeeklyRecommendations(state: AppState): WeeklyRecommendationBatch {
  const ranked = rankCandidates(state, "discovery");
  const picks = pickDiverseCandidates(ranked, DISCOVERY_COUNT, "discovery");
  const items = buildItems(picks, "discovery");

  return {
    id: safeId("batch", `${state.group.id}-${Date.now()}`),
    groupId: state.group.id,
    weekOf: startOfWeek().toISOString(),
    createdAt: new Date().toISOString(),
    items
  };
}

export function generatePendingWeeklyOptions(state: AppState) {
  const ranked = rankCandidates(state, "pending");
  const picks = pickDiverseCandidates(ranked, PENDING_COUNT, "pending");
  return buildItems(picks, "pending");
}
