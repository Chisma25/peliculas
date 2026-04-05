import {
  AppState,
  Movie,
  RecommendationMetric,
  RecommendationReason,
  UpcomingReleaseSuggestion,
  WeeklyRecommendationBatch,
  WeeklyRecommendationItem
} from "@/lib/types";
import { average, safeId, startOfWeek } from "@/lib/utils";

type FeatureMap = Record<string, number>;
type CountMap = Record<string, number>;
type CandidateMode = "discovery" | "pending" | "upcoming";

type TasteProfile = {
  genre: FeatureMap;
  director: FeatureMap;
  cast: FeatureMap;
  decade: FeatureMap;
  language: FeatureMap;
  country: FeatureMap;
  tokens: FeatureMap;
  concepts: FeatureMap;
  historyGenreCount: CountMap;
  historyDirectorCount: CountMap;
  historyCastCount: CountMap;
  historyDecadeCount: CountMap;
  historyLanguageCount: CountMap;
  historyCountryCount: CountMap;
  historyConceptCount: CountMap;
  targetDuration: number;
  durationTolerance: number;
  targetQuality: number;
  ratingsCount: number;
  averageScore: number;
};

type WeeklyContext = {
  recentMovieIds: string[];
  genres: FeatureMap;
  directors: FeatureMap;
  concepts: FeatureMap;
  averageDuration: number;
};

type FeedbackProfile = {
  selectedGenres: FeatureMap;
  selectedDirectors: FeatureMap;
  selectedConcepts: FeatureMap;
  skippedGenres: FeatureMap;
  skippedDirectors: FeatureMap;
  skippedConcepts: FeatureMap;
  pendingMomentum: FeatureMap;
};

type PredictionMetrics = {
  averagePrediction: number;
  disagreement: number;
};

type ScoreBreakdown = {
  structured: number;
  semantic: number;
  prediction: number;
  disagreement: number;
  watchability: number;
  quality: number;
  novelty: number;
  context: number;
  feedback: number;
};

type ReasonSignal = {
  label: string;
  detail: string;
  weight: number;
};

type ScoredCandidate = {
  movie: Movie;
  rawScore: number;
  displayScore: number;
  breakdown: ScoreBreakdown;
  reasons: RecommendationReason[];
  summary: string;
  metrics: RecommendationMetric[];
};

const DISCOVERY_COUNT = 3;
const PENDING_COUNT = 5;

const TOKEN_STOPWORDS = new Set([
  "a",
  "al",
  "algo",
  "alla",
  "alli",
  "alto",
  "ante",
  "antes",
  "as",
  "at",
  "aun",
  "away",
  "bajo",
  "be",
  "but",
  "by",
  "cada",
  "como",
  "con",
  "contra",
  "cuando",
  "de",
  "del",
  "desde",
  "donde",
  "dos",
  "during",
  "el",
  "ella",
  "ellas",
  "ellos",
  "en",
  "entre",
  "era",
  "es",
  "esa",
  "ese",
  "eso",
  "esta",
  "estas",
  "este",
  "esto",
  "for",
  "from",
  "ha",
  "hacia",
  "hasta",
  "he",
  "her",
  "him",
  "his",
  "i",
  "in",
  "into",
  "it",
  "its",
  "la",
  "las",
  "le",
  "les",
  "lo",
  "los",
  "mas",
  "mi",
  "mis",
  "my",
  "no",
  "nos",
  "o",
  "of",
  "on",
  "otra",
  "otro",
  "otras",
  "otros",
  "para",
  "pero",
  "por",
  "que",
  "se",
  "sin",
  "sobre",
  "su",
  "sus",
  "the",
  "their",
  "them",
  "through",
  "to",
  "tras",
  "tu",
  "una",
  "uno",
  "unos",
  "unas",
  "un",
  "was",
  "with",
  "y"
]);

const CONCEPT_KEYWORDS: Record<string, string[]> = {
  intimate: ["family", "father", "mother", "daughter", "son", "friendship", "relationship", "vacaciones", "memoria", "memory", "grief", "duelo", "cotidiano", "intimate", "padre", "madre", "pareja"],
  dark: ["dark", "bleak", "violent", "violencia", "corrupcion", "corruption", "noir", "grim", "desesperacion", "nihilist", "brutal"],
  tense: ["thriller", "tension", "tense", "suspense", "investigation", "asesinato", "murder", "detective", "hostage", "manhunt", "obsession"],
  funny: ["comedia", "comedy", "funny", "humor", "satira", "satire", "absurd", "witty", "buddy"],
  romantic: ["romance", "love", "lovers", "pareja", "amor", "relationship", "encuentro"],
  reflective: ["memory", "recuerdo", "identidad", "identity", "soledad", "loneliness", "existential", "introspective", "coming to terms", "tiempo"],
  hopeful: ["hope", "hopeful", "uplifting", "redemption", "redencion", "amistad", "friendship", "inspiring", "healing"],
  crime: ["crime", "crimen", "criminal", "mafia", "gangster", "heist", "robbery", "police", "murder", "serial", "court"],
  spectacle: ["epic", "blockbuster", "battle", "war", "hero", "action", "setpiece", "spectacle", "disaster"],
  adventure: ["adventure", "journey", "quest", "road", "viaje", "expedition", "odyssey", "treasure"],
  family: ["family", "familia", "children", "child", "kid", "kids", "pixar", "parents", "coming home"],
  sci_fi: ["alien", "future", "futuristic", "robot", "space", "dystopia", "science", "scientist", "time", "extraterrestre", "distopia"],
  animation: ["animation", "animated", "animacion", "anime", "pixar", "dreamworks"],
  historical: ["historical", "history", "war", "period", "biopic", "based on a true story", "siglo", "imperio", "epoca", "civil war"],
  musical: ["music", "musician", "band", "singer", "concert", "musical", "rock", "jazz", "composer"],
  survival: ["survival", "escape", "prison", "rescue", "isolated", "desierto", "ocean", "lost", "hunt", "persecucion"],
  coming_of_age: ["teen", "teenager", "adolescence", "school", "coming of age", "juventud", "infancia", "growing up"],
  mystery: ["mystery", "secret", "enigmatic", "enigma", "missing", "unknown", "twist", "misterio"]
};

const GENRE_CONCEPTS: Record<string, string[]> = {
  accion: ["spectacle", "adventure"],
  adventure: ["adventure", "spectacle"],
  aventura: ["adventure", "spectacle"],
  animation: ["animation", "family"],
  animacion: ["animation", "family"],
  comedy: ["funny", "hopeful"],
  comedia: ["funny", "hopeful"],
  "comedia dramatica": ["funny", "intimate"],
  crime: ["crime", "tense", "dark"],
  crimen: ["crime", "tense", "dark"],
  drama: ["intimate", "reflective"],
  fantasia: ["adventure", "hopeful"],
  family: ["family", "hopeful"],
  familia: ["family", "hopeful"],
  history: ["historical", "reflective"],
  historia: ["historical", "reflective"],
  horror: ["dark", "tense"],
  misterio: ["mystery", "tense"],
  mystery: ["mystery", "tense"],
  musical: ["musical", "hopeful"],
  "neo noir": ["dark", "crime", "reflective"],
  "science fiction": ["sci_fi", "spectacle"],
  "ciencia ficcion": ["sci_fi", "spectacle"],
  suspense: ["tense", "mystery"],
  thriller: ["tense", "dark", "mystery"],
  romance: ["romantic", "intimate"],
  western: ["historical", "adventure"],
  belica: ["historical", "spectacle"],
  guerra: ["historical", "spectacle"],
  documental: ["reflective", "historical"]
};

const CONCEPT_LABELS: Record<string, string> = {
  intimate: "íntimo",
  dark: "oscuro",
  tense: "tenso",
  funny: "más ligero",
  romantic: "romántico",
  reflective: "reflexivo",
  hopeful: "esperanzador",
  crime: "criminal",
  spectacle: "de gran escala",
  adventure: "de aventura",
  family: "familiar",
  sci_fi: "de ciencia ficción",
  animation: "animado",
  historical: "de época",
  musical: "musical",
  survival: "de supervivencia",
  coming_of_age: "de paso a la adultez",
  mystery: "misterioso"
};

const tokenCache = new Map<string, string[]>();
const conceptCache = new Map<string, FeatureMap>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string | undefined | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 2 && !TOKEN_STOPWORDS.has(token)) ?? [];
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function uniqueNormalized(values: string[]) {
  return unique(values.map((value) => normalizeText(value)).filter(Boolean));
}

function getMovieTokens(movie: Movie) {
  const cached = tokenCache.get(movie.id);
  if (cached) {
    return cached;
  }

  const tokens = unique(
    tokenize(
      [
        movie.title,
        movie.synopsis,
        movie.genres.join(" "),
        movie.director,
        movie.cast.slice(0, 5).join(" "),
        movie.language,
        movie.country
      ].join(" ")
    )
  );

  tokenCache.set(movie.id, tokens);
  return tokens;
}

function toTokenFrequency(tokens: string[]) {
  const frequency: CountMap = {};
  for (const token of tokens) {
    frequency[token] = (frequency[token] ?? 0) + 1;
  }
  return frequency;
}

function normalizeFeatureMap(map: FeatureMap) {
  const entries = Object.entries(map);
  if (entries.length === 0) {
    return {};
  }

  const maxMagnitude = Math.max(...entries.map(([, value]) => Math.abs(value))) || 1;
  return Object.fromEntries(entries.map(([key, value]) => [key, value / maxMagnitude]));
}

function normalizeCountMap(map: CountMap) {
  const entries = Object.entries(map);
  if (entries.length === 0) {
    return {};
  }

  const maxValue = Math.max(...entries.map(([, value]) => value)) || 1;
  return Object.fromEntries(entries.map(([key, value]) => [key, value / maxValue]));
}

function incrementCount(map: CountMap, key: string, amount = 1) {
  if (!key) {
    return;
  }

  map[key] = (map[key] ?? 0) + amount;
}

function adjustFeature(map: FeatureMap, key: string, amount: number) {
  if (!key || amount === 0) {
    return;
  }

  map[key] = (map[key] ?? 0) + amount;
}

function getMovieDecade(movie: Movie) {
  if (!Number.isFinite(movie.year) || movie.year <= 0) {
    return "";
  }

  return `${Math.floor(movie.year / 10) * 10}s`;
}

function parseExternalRating(movie: Movie) {
  const raw = movie.externalRating?.value?.trim();
  if (!raw) {
    return null;
  }

  if (raw.includes("%")) {
    const value = Number.parseFloat(raw.replace("%", ""));
    return Number.isFinite(value) ? clamp(value / 10, 0, 10) : null;
  }

  if (raw.includes("/10")) {
    const value = Number.parseFloat(raw.split("/10")[0]);
    return Number.isFinite(value) ? clamp(value, 0, 10) : null;
  }

  if (raw.includes("/100")) {
    const value = Number.parseFloat(raw.split("/100")[0]);
    return Number.isFinite(value) ? clamp(value / 10, 0, 10) : null;
  }

  const numeric = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric > 10 ? clamp(numeric / 10, 0, 10) : clamp(numeric, 0, 10);
}

function getMovieConcepts(movie: Movie) {
  const cached = conceptCache.get(movie.id);
  if (cached) {
    return cached;
  }

  const tokens = getMovieTokens(movie);
  const tokenFrequency = toTokenFrequency(tokens);
  const joinedText = normalizeText(
    [
      movie.title,
      movie.synopsis,
      movie.genres.join(" "),
      movie.director,
      movie.cast.slice(0, 5).join(" "),
      movie.language,
      movie.country
    ].join(" ")
  );

  const concepts: CountMap = {};

  for (const [concept, keywords] of Object.entries(CONCEPT_KEYWORDS)) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) {
        continue;
      }

      if (normalizedKeyword.includes(" ")) {
        if (joinedText.includes(normalizedKeyword)) {
          incrementCount(concepts, concept, 1.35);
        }
      } else if (tokenFrequency[normalizedKeyword]) {
        incrementCount(concepts, concept, tokenFrequency[normalizedKeyword]);
      }
    }
  }

  for (const genre of movie.genres) {
    const normalizedGenre = normalizeText(genre);
    for (const [genreKey, genreConcepts] of Object.entries(GENRE_CONCEPTS)) {
      if (normalizedGenre.includes(genreKey)) {
        for (const concept of genreConcepts) {
          incrementCount(concepts, concept, 1.15);
        }
      }
    }
  }

  if (movie.durationMinutes >= 150) {
    incrementCount(concepts, "spectacle", 0.35);
    incrementCount(concepts, "historical", 0.15);
  }

  if (movie.durationMinutes <= 105) {
    incrementCount(concepts, "funny", 0.1);
    incrementCount(concepts, "hopeful", 0.1);
  }

  const normalized = normalizeCountMap(concepts);
  conceptCache.set(movie.id, normalized);
  return normalized;
}

function getPreferenceSignal(score: number) {
  return clamp((score - 6.25) / 2.75, -1, 1.2);
}

function getPositiveSignal(score: number) {
  return clamp((score - 5) / 5, 0, 1.25);
}

function createEmptyProfile(): TasteProfile {
  return {
    genre: {},
    director: {},
    cast: {},
    decade: {},
    language: {},
    country: {},
    tokens: {},
    concepts: {},
    historyGenreCount: {},
    historyDirectorCount: {},
    historyCastCount: {},
    historyDecadeCount: {},
    historyLanguageCount: {},
    historyCountryCount: {},
    historyConceptCount: {},
    targetDuration: 118,
    durationTolerance: 32,
    targetQuality: 7.8,
    ratingsCount: 0,
    averageScore: 0
  };
}

function getMovieById(state: AppState, movieId: string) {
  return state.movies.find((movie) => movie.id === movieId) ?? null;
}

function buildTasteProfile(state: AppState, userId: string) {
  const profile = createEmptyProfile();
  const ratings = state.ratings.filter((rating) => rating.userId === userId);

  let durationWeighted = 0;
  let durationWeight = 0;
  let durationVarianceWeighted = 0;
  let qualityWeighted = 0;
  let qualityWeight = 0;

  for (const rating of ratings) {
    const movie = getMovieById(state, rating.movieId);
    if (!movie) {
      continue;
    }

    const sentiment = getPreferenceSignal(rating.score);
    const positive = getPositiveSignal(rating.score);

    for (const genre of uniqueNormalized(movie.genres)) {
      adjustFeature(profile.genre, genre, sentiment * 1.35);
      incrementCount(profile.historyGenreCount, genre, positive + 0.2);
    }

    const director = normalizeText(movie.director);
    if (director) {
      adjustFeature(profile.director, director, sentiment * 1.15);
      incrementCount(profile.historyDirectorCount, director, positive + 0.2);
    }

    for (const actor of uniqueNormalized(movie.cast.slice(0, 4))) {
      adjustFeature(profile.cast, actor, sentiment * 0.85);
      incrementCount(profile.historyCastCount, actor, positive + 0.15);
    }

    const decade = getMovieDecade(movie);
    if (decade) {
      adjustFeature(profile.decade, decade, sentiment * 0.7);
      incrementCount(profile.historyDecadeCount, decade, positive + 0.1);
    }

    const language = normalizeText(movie.language);
    if (language) {
      adjustFeature(profile.language, language, sentiment * 0.55);
      incrementCount(profile.historyLanguageCount, language, positive + 0.05);
    }

    const country = normalizeText(movie.country);
    if (country) {
      adjustFeature(profile.country, country, sentiment * 0.45);
      incrementCount(profile.historyCountryCount, country, positive + 0.05);
    }

    for (const token of getMovieTokens(movie).slice(0, 18)) {
      adjustFeature(profile.tokens, token, sentiment * 0.22);
    }

    const concepts = getMovieConcepts(movie);
    for (const [concept, value] of Object.entries(concepts)) {
      adjustFeature(profile.concepts, concept, value * sentiment * 1.6);
      incrementCount(profile.historyConceptCount, concept, value * (positive + 0.1));
    }

    if (movie.durationMinutes > 0) {
      durationWeighted += movie.durationMinutes * (positive + 0.25);
      durationWeight += positive + 0.25;
    }

    const externalRating = parseExternalRating(movie);
    if (externalRating !== null) {
      qualityWeighted += externalRating * (positive + 0.25);
      qualityWeight += positive + 0.25;
    }
  }

  if (durationWeight > 0) {
    profile.targetDuration = durationWeighted / durationWeight;
    for (const rating of ratings) {
      const movie = getMovieById(state, rating.movieId);
      if (!movie?.durationMinutes) {
        continue;
      }

      const positive = getPositiveSignal(rating.score) + 0.25;
      durationVarianceWeighted += Math.abs(movie.durationMinutes - profile.targetDuration) * positive;
    }

    profile.durationTolerance = clamp(durationVarianceWeighted / durationWeight + 18, 22, 60);
  }

  if (qualityWeight > 0) {
    profile.targetQuality = qualityWeighted / qualityWeight;
  }

  profile.ratingsCount = ratings.length;
  profile.averageScore = average(ratings.map((rating) => rating.score));
  profile.genre = normalizeFeatureMap(profile.genre);
  profile.director = normalizeFeatureMap(profile.director);
  profile.cast = normalizeFeatureMap(profile.cast);
  profile.decade = normalizeFeatureMap(profile.decade);
  profile.language = normalizeFeatureMap(profile.language);
  profile.country = normalizeFeatureMap(profile.country);
  profile.tokens = normalizeFeatureMap(profile.tokens);
  profile.concepts = normalizeFeatureMap(profile.concepts);

  return profile;
}

function mergeFeatureMaps(items: Array<{ map: FeatureMap; weight: number }>) {
  const merged: FeatureMap = {};

  for (const { map, weight } of items) {
    for (const [key, value] of Object.entries(map)) {
      merged[key] = (merged[key] ?? 0) + value * weight;
    }
  }

  return normalizeFeatureMap(merged);
}

function mergeCountMaps(items: Array<{ map: CountMap; weight: number }>) {
  const merged: CountMap = {};

  for (const { map, weight } of items) {
    for (const [key, value] of Object.entries(map)) {
      merged[key] = (merged[key] ?? 0) + value * weight;
    }
  }

  return merged;
}

function mergeProfiles(profiles: TasteProfile[]) {
  if (profiles.length === 0) {
    return createEmptyProfile();
  }

  const weighted = profiles.map((profile) => ({
    profile,
    weight: Math.max(1, Math.sqrt(Math.max(profile.ratingsCount, 1)))
  }));

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  return {
    genre: mergeFeatureMaps(weighted.map(({ profile, weight }) => ({ map: profile.genre, weight }))),
    director: mergeFeatureMaps(weighted.map(({ profile, weight }) => ({ map: profile.director, weight }))),
    cast: mergeFeatureMaps(weighted.map(({ profile, weight }) => ({ map: profile.cast, weight }))),
    decade: mergeFeatureMaps(weighted.map(({ profile, weight }) => ({ map: profile.decade, weight }))),
    language: mergeFeatureMaps(weighted.map(({ profile, weight }) => ({ map: profile.language, weight }))),
    country: mergeFeatureMaps(weighted.map(({ profile, weight }) => ({ map: profile.country, weight }))),
    tokens: mergeFeatureMaps(weighted.map(({ profile, weight }) => ({ map: profile.tokens, weight }))),
    concepts: mergeFeatureMaps(weighted.map(({ profile, weight }) => ({ map: profile.concepts, weight }))),
    historyGenreCount: mergeCountMaps(weighted.map(({ profile, weight }) => ({ map: profile.historyGenreCount, weight }))),
    historyDirectorCount: mergeCountMaps(weighted.map(({ profile, weight }) => ({ map: profile.historyDirectorCount, weight }))),
    historyCastCount: mergeCountMaps(weighted.map(({ profile, weight }) => ({ map: profile.historyCastCount, weight }))),
    historyDecadeCount: mergeCountMaps(weighted.map(({ profile, weight }) => ({ map: profile.historyDecadeCount, weight }))),
    historyLanguageCount: mergeCountMaps(weighted.map(({ profile, weight }) => ({ map: profile.historyLanguageCount, weight }))),
    historyCountryCount: mergeCountMaps(weighted.map(({ profile, weight }) => ({ map: profile.historyCountryCount, weight }))),
    historyConceptCount: mergeCountMaps(weighted.map(({ profile, weight }) => ({ map: profile.historyConceptCount, weight }))),
    targetDuration: weighted.reduce((sum, entry) => sum + entry.profile.targetDuration * entry.weight, 0) / totalWeight,
    durationTolerance: weighted.reduce((sum, entry) => sum + entry.profile.durationTolerance * entry.weight, 0) / totalWeight,
    targetQuality: weighted.reduce((sum, entry) => sum + entry.profile.targetQuality * entry.weight, 0) / totalWeight,
    ratingsCount: weighted.reduce((sum, entry) => sum + entry.profile.ratingsCount, 0),
    averageScore: weighted.reduce((sum, entry) => sum + entry.profile.averageScore * entry.weight, 0) / totalWeight
  };
}

function buildProfiles(state: AppState) {
  const userProfiles = state.users.map((user) => ({
    userId: user.id,
    profile: buildTasteProfile(state, user.id)
  }));

  return {
    userProfiles,
    groupProfile: mergeProfiles(userProfiles.map((entry) => entry.profile))
  };
}

function scoreKeySet(preferences: FeatureMap, keys: string[]) {
  const normalizedKeys = uniqueNormalized(keys);
  if (normalizedKeys.length === 0) {
    return 0.5;
  }

  const values = normalizedKeys.map((key) => preferences[key] ?? 0);
  return clamp(0.5 + average(values) / 2, 0, 1);
}

function scoreWeightedMap(preferences: FeatureMap, values: FeatureMap) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return 0.5;
  }

  let totalWeight = 0;
  let totalValue = 0;

  for (const [key, weight] of entries) {
    totalWeight += Math.abs(weight);
    totalValue += (preferences[key] ?? 0) * weight;
  }

  if (totalWeight === 0) {
    return 0.5;
  }

  return clamp(0.5 + totalValue / (totalWeight * 2), 0, 1);
}

function scoreStructuredAffinity(profile: TasteProfile, movie: Movie) {
  const tokenScore = scoreKeySet(profile.tokens, getMovieTokens(movie).slice(0, 18));

  return clamp(
    scoreKeySet(profile.genre, movie.genres) * 0.29 +
      scoreKeySet(profile.director, [movie.director]) * 0.16 +
      scoreKeySet(profile.cast, movie.cast.slice(0, 4)) * 0.12 +
      scoreKeySet(profile.decade, [getMovieDecade(movie)]) * 0.09 +
      scoreKeySet(profile.language, [movie.language]) * 0.08 +
      scoreKeySet(profile.country, [movie.country]) * 0.06 +
      tokenScore * 0.2,
    0,
    1
  );
}

function scoreSemanticAffinity(profile: TasteProfile, movie: Movie) {
  return clamp(scoreWeightedMap(profile.concepts, getMovieConcepts(movie)) * 0.8 + scoreKeySet(profile.tokens, getMovieTokens(movie)) * 0.2, 0, 1);
}

function getDurationFit(movie: Movie, profile: TasteProfile) {
  if (!movie.durationMinutes) {
    return 0.55;
  }

  const distance = Math.abs(movie.durationMinutes - profile.targetDuration);
  const allowed = Math.max(profile.durationTolerance * 2.4, 70);
  return clamp(1 - distance / allowed, 0, 1);
}

function getWatchability(movie: Movie, profile: TasteProfile, mode: CandidateMode) {
  const durationFit = getDurationFit(movie, profile);
  const genres = uniqueNormalized(movie.genres);
  const easyGenres = ["comedia", "comedy", "aventura", "adventure", "familia", "family", "drama", "animacion", "animation", "romance"];
  const demandingGenres = ["horror", "terror", "war", "guerra", "crime", "crimen", "thriller", "noir"];

  const easyFactor = genres.some((genre) => easyGenres.some((key) => genre.includes(key))) ? 0.16 : 0;
  const demandingFactor = genres.some((genre) => demandingGenres.some((key) => genre.includes(key))) ? 0.08 : 0;
  const rating = parseExternalRating(movie);
  const qualityLift = rating ? clamp((rating - 6.5) / 4, 0, 1) : 0.45;
  const modeBonus = mode === "pending" ? 0.05 : 0;

  return clamp(0.42 * durationFit + 0.26 * qualityLift + 0.22 * (0.5 + easyFactor - demandingFactor) + 0.1 * (0.5 + modeBonus), 0, 1);
}

function getQualityScore(movie: Movie, profile: TasteProfile) {
  const rating = parseExternalRating(movie);
  if (rating === null) {
    return 0.55;
  }

  const raw = clamp(rating / 10, 0, 1);
  const harmony = clamp(1 - Math.abs(rating - profile.targetQuality) / 3.25, 0, 1);
  return clamp(raw * 0.58 + harmony * 0.42, 0, 1);
}

function getNoveltyFromCounts(counts: CountMap, keys: string[]) {
  const normalizedKeys = uniqueNormalized(keys);
  if (normalizedKeys.length === 0) {
    return 0.55;
  }

  return average(
    normalizedKeys.map((key) => {
      const count = counts[key] ?? 0;
      return 1 / (1 + count);
    })
  );
}

function getConceptNovelty(counts: CountMap, concepts: FeatureMap) {
  const keys = Object.keys(concepts);
  if (keys.length === 0) {
    return 0.55;
  }

  return average(
    keys.map((key) => {
      const count = counts[key] ?? 0;
      return 1 / (1 + count);
    })
  );
}

function getNoveltyScore(movie: Movie, profile: TasteProfile, mode: CandidateMode) {
  const genreNovelty = getNoveltyFromCounts(profile.historyGenreCount, movie.genres);
  const directorNovelty = getNoveltyFromCounts(profile.historyDirectorCount, [movie.director]);
  const conceptNovelty = getConceptNovelty(profile.historyConceptCount, getMovieConcepts(movie));
  const base = genreNovelty * 0.45 + directorNovelty * 0.2 + conceptNovelty * 0.35;

  return clamp(mode === "discovery" ? 0.35 + base * 0.65 : 0.45 + base * 0.45, 0, 1);
}

function buildWeeklyContext(state: AppState) {
  const recentEntries = [...state.watchEntries]
    .sort((left, right) => (right.watchedOn ?? "").localeCompare(left.watchedOn ?? ""))
    .slice(0, 4);

  const genres: CountMap = {};
  const directors: CountMap = {};
  const concepts: CountMap = {};
  const durations: number[] = [];

  recentEntries.forEach((entry, index) => {
    const movie = getMovieById(state, entry.movieId);
    if (!movie) {
      return;
    }

    const weight = (recentEntries.length - index) / recentEntries.length;
    for (const genre of uniqueNormalized(movie.genres)) {
      incrementCount(genres, genre, weight);
    }

    const director = normalizeText(movie.director);
    if (director) {
      incrementCount(directors, director, weight);
    }

    for (const [concept, value] of Object.entries(getMovieConcepts(movie))) {
      incrementCount(concepts, concept, value * weight);
    }

    if (movie.durationMinutes > 0) {
      durations.push(movie.durationMinutes);
    }
  });

  return {
    recentMovieIds: recentEntries.map((entry) => entry.movieId),
    genres: normalizeCountMap(genres),
    directors: normalizeCountMap(directors),
    concepts: normalizeCountMap(concepts),
    averageDuration: average(durations)
  };
}

function buildFeedbackProfile(state: AppState) {
  const sortedBatches = [...state.weeklyBatches]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 12);

  const selectedGenres: CountMap = {};
  const selectedDirectors: CountMap = {};
  const selectedConcepts: CountMap = {};
  const skippedGenres: CountMap = {};
  const skippedDirectors: CountMap = {};
  const skippedConcepts: CountMap = {};

  sortedBatches.forEach((batch, index) => {
    const recency = 1 - index / (sortedBatches.length + 2);
    const selectedMovie = batch.selectedMovieId ? getMovieById(state, batch.selectedMovieId) : null;

    if (selectedMovie) {
      for (const genre of uniqueNormalized(selectedMovie.genres)) {
        incrementCount(selectedGenres, genre, 1.2 * recency);
      }

      const director = normalizeText(selectedMovie.director);
      if (director) {
        incrementCount(selectedDirectors, director, 1.1 * recency);
      }

      for (const [concept, value] of Object.entries(getMovieConcepts(selectedMovie))) {
        incrementCount(selectedConcepts, concept, value * recency);
      }
    }

    for (const item of batch.items) {
      if (item.movieId === batch.selectedMovieId) {
        continue;
      }

      const movie = getMovieById(state, item.movieId);
      if (!movie) {
        continue;
      }

      for (const genre of uniqueNormalized(movie.genres)) {
        incrementCount(skippedGenres, genre, 0.35 * recency);
      }

      const director = normalizeText(movie.director);
      if (director) {
        incrementCount(skippedDirectors, director, 0.3 * recency);
      }

      for (const [concept, value] of Object.entries(getMovieConcepts(movie))) {
        incrementCount(skippedConcepts, concept, value * 0.3 * recency);
      }
    }
  });

  const pendingMomentum: FeatureMap = {};
  state.pendingMovieIds.forEach((movieId, index) => {
    const total = Math.max(state.pendingMovieIds.length - 1, 1);
    pendingMomentum[movieId] = clamp(1 - index / total, 0.15, 1);
  });

  return {
    selectedGenres: normalizeCountMap(selectedGenres),
    selectedDirectors: normalizeCountMap(selectedDirectors),
    selectedConcepts: normalizeCountMap(selectedConcepts),
    skippedGenres: normalizeCountMap(skippedGenres),
    skippedDirectors: normalizeCountMap(skippedDirectors),
    skippedConcepts: normalizeCountMap(skippedConcepts),
    pendingMomentum
  };
}

function getContextOverlap(map: FeatureMap, keys: string[]) {
  const normalizedKeys = uniqueNormalized(keys);
  if (normalizedKeys.length === 0) {
    return 0;
  }

  return average(normalizedKeys.map((key) => map[key] ?? 0));
}

function getContextConceptOverlap(context: FeatureMap, movieConcepts: FeatureMap) {
  const entries = Object.entries(movieConcepts);
  if (entries.length === 0) {
    return 0;
  }

  let total = 0;
  let weight = 0;

  for (const [concept, value] of entries) {
    total += (context[concept] ?? 0) * value;
    weight += Math.abs(value);
  }

  return weight > 0 ? total / weight : 0;
}

function getWeeklyContextScore(movie: Movie, context: WeeklyContext, mode: CandidateMode) {
  const movieConcepts = getMovieConcepts(movie);
  const genreOverlap = getContextOverlap(context.genres, movie.genres);
  const directorOverlap = getContextOverlap(context.directors, [movie.director]);
  const conceptOverlap = getContextConceptOverlap(context.concepts, movieConcepts);
  const durationComfort =
    context.averageDuration > 0
      ? clamp(1 - Math.abs(movie.durationMinutes - context.averageDuration) / 110, 0, 1)
      : 0.55;

  const repeatPressure = clamp(genreOverlap * 0.42 + directorOverlap * 0.22 + conceptOverlap * 0.36, 0, 1);

  if (mode === "discovery") {
    const contrast = 1 - repeatPressure;
    return clamp(0.34 + contrast * 0.52 + durationComfort * 0.14, 0, 1);
  }

  const bridge = 1 - Math.abs(repeatPressure - 0.35);
  return clamp(0.32 + bridge * 0.48 + durationComfort * 0.2, 0, 1);
}

function getFeedbackScore(movie: Movie, feedback: FeedbackProfile, mode: CandidateMode) {
  const movieConcepts = getMovieConcepts(movie);
  const positive =
    getContextOverlap(feedback.selectedGenres, movie.genres) * 0.38 +
    getContextOverlap(feedback.selectedDirectors, [movie.director]) * 0.17 +
    getContextConceptOverlap(feedback.selectedConcepts, movieConcepts) * 0.45;
  const negative =
    getContextOverlap(feedback.skippedGenres, movie.genres) * 0.42 +
    getContextOverlap(feedback.skippedDirectors, [movie.director]) * 0.18 +
    getContextConceptOverlap(feedback.skippedConcepts, movieConcepts) * 0.4;
  const momentum = mode === "pending" ? feedback.pendingMomentum[movie.id] ?? 0 : 0;

  return clamp(0.5 + positive * 0.33 - negative * 0.18 + momentum * 0.16, 0, 1);
}

function getPredictionMetrics(movie: Movie, profiles: Array<{ userId: string; profile: TasteProfile }>): PredictionMetrics {
  const predictions = profiles
    .filter((entry) => entry.profile.ratingsCount > 0)
    .map(({ profile }) => {
      const structured = scoreStructuredAffinity(profile, movie);
      const semantic = scoreSemanticAffinity(profile, movie);
      const watchability = getWatchability(movie, profile, "pending");
      const quality = getQualityScore(movie, profile);
      return clamp(structured * 0.38 + semantic * 0.3 + watchability * 0.18 + quality * 0.14, 0, 1);
    });

  if (predictions.length === 0) {
    return {
      averagePrediction: 0.55,
      disagreement: 0.12
    };
  }

  const mean = average(predictions);
  const variance = average(predictions.map((value) => (value - mean) ** 2));

  return {
    averagePrediction: mean,
    disagreement: clamp(Math.sqrt(variance) / 0.35, 0, 1)
  };
}

function findTopPositiveKey(profile: FeatureMap, keys: string[]) {
  let bestKey = "";
  let bestScore = -Infinity;

  for (const key of uniqueNormalized(keys)) {
    const score = profile[key] ?? -Infinity;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return {
    key: bestKey,
    score: Number.isFinite(bestScore) ? bestScore : 0
  };
}

function findTopConcept(profile: FeatureMap, concepts: FeatureMap) {
  let bestKey = "";
  let bestScore = -Infinity;

  for (const [concept, weight] of Object.entries(concepts)) {
    const score = (profile[concept] ?? 0) * weight;
    if (score > bestScore) {
      bestScore = score;
      bestKey = concept;
    }
  }

  return {
    key: bestKey,
    score: Number.isFinite(bestScore) ? bestScore : 0
  };
}

function buildReasonSignals(movie: Movie, profile: TasteProfile, breakdown: ScoreBreakdown, mode: CandidateMode) {
  const genreMatch = findTopPositiveKey(profile.genre, movie.genres);
  const directorMatch = findTopPositiveKey(profile.director, [movie.director]);
  const conceptMatch = findTopConcept(profile.concepts, getMovieConcepts(movie));
  const signals: ReasonSignal[] = [];

  if (genreMatch.key && genreMatch.score > 0.12) {
    signals.push({
      label: "Afinidad de grupo",
      detail: `${movie.title} pisa un terreno que al grupo le suele ir bien: ${genreMatch.key}.`,
      weight: breakdown.structured + genreMatch.score
    });
  }

  if (directorMatch.key && directorMatch.score > 0.14) {
    signals.push({
      label: "Director",
      detail: `${movie.director} ya conecta con vuestro histórico, así que aquí hay bastante base para que funcione.`,
      weight: breakdown.structured + directorMatch.score
    });
  }

  if (conceptMatch.key && conceptMatch.score > 0.08) {
    const conceptLabel = CONCEPT_LABELS[conceptMatch.key] ?? conceptMatch.key;
    signals.push({
      label: "Tono",
      detail: `Tiene un aire más ${conceptLabel} que encaja con cómo estáis puntuando últimamente.`,
      weight: breakdown.semantic + conceptMatch.score
    });
  }

  if (breakdown.context > 0.64) {
    signals.push({
      label: "Semana",
      detail:
        mode === "discovery"
          ? "Aporta un cambio de aire razonable respecto a lo último que habéis visto, sin salirse de vuestro radar."
          : "Dentro de pendientes es de las que mejor equilibran continuidad de gusto y plan cómodo para esta semana.",
      weight: breakdown.context
    });
  }

  if (breakdown.feedback > 0.63) {
    signals.push({
      label: "Feedback del grupo",
      detail:
        mode === "pending"
          ? "Se parece bastante a las pendientes que acabáis eligiendo cuando toca decidir en grupo."
          : "Recoge señales que suelen convertir bien cuando termináis escogiendo una película de la tanda.",
      weight: breakdown.feedback
    });
  }

  if (breakdown.quality > 0.68) {
    signals.push({
      label: "Calidad externa",
      detail: `Fuera del grupo también viene fuerte: ${movie.externalRating.value} en ${movie.externalRating.source}.`,
      weight: breakdown.quality
    });
  }

  if (mode === "discovery" && breakdown.novelty > 0.62) {
    signals.push({
      label: "Aire nuevo",
      detail: "Trae novedad real sin caer en una recomendación caprichosa ni totalmente fuera de tono.",
      weight: breakdown.novelty
    });
  }

  if (signals.length === 0) {
    signals.push({
      label: "Encaje general",
      detail: `${movie.title} equilibra bastante bien afinidad, calidad externa y viabilidad para el plan semanal.`,
      weight: breakdown.structured + breakdown.semantic + breakdown.watchability
    });
  }

  return signals.sort((left, right) => right.weight - left.weight);
}

function signalsToReasons(signals: ReasonSignal[]): RecommendationReason[] {
  return signals.slice(0, 3).map((signal) => ({
    label: signal.label,
    detail: signal.detail
  }));
}

function summarizeSignals(movie: Movie, signals: ReasonSignal[], mode: CandidateMode) {
  const topSignals = signals.slice(0, 2);
  if (topSignals.length === 0) {
    return `${movie.title} entra porque equilibra bastante bien lo que os suele gustar con una opción razonable para esta semana.`;
  }

  const snippets = topSignals.map((signal) => signal.detail.charAt(0).toLowerCase() + signal.detail.slice(1));
  return mode === "pending"
    ? `${movie.title} asoma arriba en pendientes porque ${snippets.join(" Además, ")}`
    : `${movie.title} aparece como descubrimiento porque ${snippets.join(" Además, ")}`;
}

function buildMetrics(breakdown: ScoreBreakdown, mode: CandidateMode, pendingMomentum = 0): RecommendationMetric[] {
  const groupRadar = clamp(breakdown.structured * 0.54 + breakdown.semantic * 0.46, 0, 1);
  const consensus = clamp(breakdown.prediction * (1 - breakdown.disagreement * 0.55), 0, 1);
  const weeklyFit = clamp(breakdown.watchability * 0.58 + breakdown.context * 0.42, 0, 1);
  const fourthMetric =
    mode === "pending"
      ? clamp(pendingMomentum * 0.65 + breakdown.feedback * 0.35, 0, 1)
      : clamp(breakdown.novelty * 0.58 + breakdown.feedback * 0.22 + breakdown.quality * 0.2, 0, 1);

  return [
    { label: "Radar grupo", value: Math.round(groupRadar * 100), tone: "warm" },
    { label: "Consenso", value: Math.round(consensus * 100), tone: "neutral" },
    { label: "Semana", value: Math.round(weeklyFit * 100), tone: "cool" },
    {
      label: mode === "pending" ? "Momento" : mode === "upcoming" ? "Estreno" : "Novedad",
      value: Math.round(fourthMetric * 100),
      tone: "warm"
    }
  ];
}

function scoreMovie(
  movie: Movie,
  groupProfile: TasteProfile,
  userProfiles: Array<{ userId: string; profile: TasteProfile }>,
  context: WeeklyContext,
  feedback: FeedbackProfile,
  mode: CandidateMode,
  previousMovieIds: Set<string>
): ScoredCandidate {
  const structured = scoreStructuredAffinity(groupProfile, movie);
  const semantic = scoreSemanticAffinity(groupProfile, movie);
  const predictionMetrics = getPredictionMetrics(movie, userProfiles);
  const watchability = getWatchability(movie, groupProfile, mode);
  const quality = getQualityScore(movie, groupProfile);
  const novelty = getNoveltyScore(movie, groupProfile, mode);
  const weeklyContext = getWeeklyContextScore(movie, context, mode);
  const feedbackScore = getFeedbackScore(movie, feedback, mode);
  const freshnessPenalty = previousMovieIds.has(movie.id) ? 0.34 : 0;
  const discoveryBonus = mode === "discovery" ? 0.22 : 0;
  const pendingMomentum = mode === "pending" ? feedback.pendingMomentum[movie.id] ?? 0 : 0;

  const rawScore =
    structured * 2.15 +
    semantic * 1.75 +
    predictionMetrics.averagePrediction * 2.3 +
    watchability * 1.18 +
    quality * 1.0 +
    novelty * (mode === "discovery" ? 1.02 : 0.58) +
    weeklyContext * 1.08 +
    feedbackScore * 0.94 +
    pendingMomentum * 0.36 +
    discoveryBonus -
    predictionMetrics.disagreement * 1.05 -
    freshnessPenalty;

  const breakdown: ScoreBreakdown = {
    structured,
    semantic,
    prediction: predictionMetrics.averagePrediction,
    disagreement: predictionMetrics.disagreement,
    watchability,
    quality,
    novelty,
    context: weeklyContext,
    feedback: feedbackScore
  };

  const signals = buildReasonSignals(movie, groupProfile, breakdown, mode);
  const metrics = buildMetrics(breakdown, mode, pendingMomentum);

  return {
    movie,
    rawScore,
    displayScore: 0,
    breakdown,
    reasons: signalsToReasons(signals),
    summary: summarizeSignals(movie, signals, mode),
    metrics
  };
}

function jaccard(left: string[], right: string[]) {
  const a = new Set(uniqueNormalized(left));
  const b = new Set(uniqueNormalized(right));
  const union = new Set([...a, ...b]);
  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

function conceptOverlap(left: FeatureMap, right: FeatureMap) {
  let total = 0;
  let weight = 0;

  for (const [concept, value] of Object.entries(left)) {
    if (!(concept in right)) {
      continue;
    }

    total += Math.min(value, right[concept]);
    weight += Math.max(value, right[concept]);
  }

  return weight > 0 ? total / weight : 0;
}

function movieOverlap(left: Movie, right: Movie) {
  const sameDirector = normalizeText(left.director) && normalizeText(left.director) === normalizeText(right.director) ? 1 : 0;
  const sameDecade = getMovieDecade(left) && getMovieDecade(left) === getMovieDecade(right) ? 1 : 0;
  const castOverlap = jaccard(left.cast.slice(0, 4), right.cast.slice(0, 4));
  const genreOverlap = jaccard(left.genres, right.genres);
  const semanticOverlap = conceptOverlap(getMovieConcepts(left), getMovieConcepts(right));

  return clamp(sameDirector * 0.34 + genreOverlap * 0.28 + semanticOverlap * 0.24 + castOverlap * 0.1 + sameDecade * 0.04, 0, 1);
}

function pickDiverseCandidates(candidates: ScoredCandidate[], desiredCount: number) {
  const ordered = [...candidates].sort((left, right) => right.rawScore - left.rawScore);
  const selected: ScoredCandidate[] = [];
  const remaining = [...ordered];

  while (selected.length < desiredCount && remaining.length > 0) {
    let bestIndex = 0;
    let bestAdjusted = -Infinity;

    remaining.forEach((candidate, index) => {
      const overlapPenalty =
        selected.length === 0
          ? 0
          : average(selected.map((picked) => movieOverlap(picked.movie, candidate.movie))) * 0.58;
      const adjustedScore = candidate.rawScore - overlapPenalty;

      if (adjustedScore > bestAdjusted) {
        bestAdjusted = adjustedScore;
        bestIndex = index;
      }
    });

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected.sort((left, right) => right.rawScore - left.rawScore);
}

function applyDisplayScores(candidates: ScoredCandidate[], mode: CandidateMode) {
  if (candidates.length === 0) {
    return candidates;
  }

  const rawValues = candidates.map((candidate) => candidate.rawScore);
  const minScore = Math.min(...rawValues);
  const maxScore = Math.max(...rawValues);
  const base = mode === "discovery" ? 74 : 72;
  const range = mode === "discovery" ? 24 : 26;

  if (Math.abs(maxScore - minScore) < 0.001) {
    return candidates.map((candidate, index) => ({
      ...candidate,
      displayScore: Math.round(clamp(94 - index * 2.2, 70, 98))
    }));
  }

  return candidates.map((candidate) => ({
    ...candidate,
    displayScore: Math.round(base + ((candidate.rawScore - minScore) / (maxScore - minScore)) * range)
  }));
}

function buildCandidatePool(state: AppState, mode: CandidateMode) {
  const seenIds = new Set(state.watchEntries.map((entry) => entry.movieId));
  const pendingIds = new Set(state.pendingMovieIds);

  return state.movies.filter((movie) => {
    if (mode === "discovery") {
      return !seenIds.has(movie.id) && !pendingIds.has(movie.id);
    }

    return pendingIds.has(movie.id);
  });
}

function createRecommendationItems(candidates: ScoredCandidate[]): WeeklyRecommendationItem[] {
  return candidates.map((candidate, index) => ({
    id: safeId("rec", `${candidate.movie.id}_${index}`),
    movieId: candidate.movie.id,
    score: candidate.displayScore,
    summary: candidate.summary,
    reasons: candidate.reasons,
    metrics: candidate.metrics
  }));
}

export function generateWeeklyRecommendations(state: AppState): WeeklyRecommendationBatch {
  const { groupProfile, userProfiles } = buildProfiles(state);
  const context = buildWeeklyContext(state);
  const feedback = buildFeedbackProfile(state);
  const previousBatch = [...state.weeklyBatches].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const previousMovieIds = new Set(previousBatch?.items.map((item) => item.movieId) ?? []);

  const candidates = buildCandidatePool(state, "discovery").map((movie) =>
    scoreMovie(movie, groupProfile, userProfiles, context, feedback, "discovery", previousMovieIds)
  );

  const selected = applyDisplayScores(pickDiverseCandidates(candidates, DISCOVERY_COUNT), "discovery");

  return {
    id: safeId("batch", "weekly"),
    groupId: state.group.id,
    weekOf: startOfWeek().toISOString(),
    createdAt: new Date().toISOString(),
    items: createRecommendationItems(selected)
  };
}

export function generatePendingWeeklyOptions(state: AppState): WeeklyRecommendationItem[] {
  const { groupProfile, userProfiles } = buildProfiles(state);
  const context = buildWeeklyContext(state);
  const feedback = buildFeedbackProfile(state);
  const previousBatch = [...state.weeklyBatches].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const previousMovieIds = new Set(previousBatch?.items.map((item) => item.movieId) ?? []);

  const candidates = buildCandidatePool(state, "pending").map((movie) =>
    scoreMovie(movie, groupProfile, userProfiles, context, feedback, "pending", previousMovieIds)
  );

  return createRecommendationItems(applyDisplayScores(pickDiverseCandidates(candidates, PENDING_COUNT), "pending"));
}

export function rankUpcomingReleasesForGroup(state: AppState, upcomingMovies: Movie[], desiredCount = 3): UpcomingReleaseSuggestion[] {
  const { groupProfile, userProfiles } = buildProfiles(state);
  const context = buildWeeklyContext(state);
  const feedback = buildFeedbackProfile(state);
  const previousBatch = [...state.weeklyBatches].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const previousMovieIds = new Set(previousBatch?.items.map((item) => item.movieId) ?? []);
  const moviesById = new Map(state.movies.map((movie) => [movie.id, movie]));
  const watchedIds = new Set(state.watchEntries.map((entry) => entry.movieId));
  const pendingIds = new Set(state.pendingMovieIds);
  const watchedTmdbIds = new Set(
    state.watchEntries
      .map((entry) => moviesById.get(entry.movieId)?.sourceIds?.tmdb)
      .filter((value): value is string => Boolean(value))
  );
  const pendingTmdbIds = new Set(
    state.pendingMovieIds
      .map((movieId) => moviesById.get(movieId)?.sourceIds?.tmdb)
      .filter((value): value is string => Boolean(value))
  );
  const now = new Date();

  const candidates = upcomingMovies
    .filter(
      (movie) =>
        (movie.releaseDateEs ?? movie.releaseDate) &&
        !watchedIds.has(movie.id) &&
        !pendingIds.has(movie.id) &&
        !(movie.sourceIds?.tmdb && watchedTmdbIds.has(movie.sourceIds.tmdb)) &&
        !(movie.sourceIds?.tmdb && pendingTmdbIds.has(movie.sourceIds.tmdb))
    )
    .map((movie) => {
      const scored = scoreMovie(movie, groupProfile, userProfiles, context, feedback, "upcoming", previousMovieIds);
      const releaseDate = new Date(movie.releaseDateEs ?? movie.releaseDate!);
      const daysUntilRelease = Math.max(0, (releaseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const releaseMomentum = clamp(1 - daysUntilRelease / 31, 0.2, 1);
      const urgencyBoost = releaseMomentum * 0.44;

      return {
        ...scored,
        rawScore: scored.rawScore + urgencyBoost,
        metrics: [
          ...scored.metrics.slice(0, 3),
          { label: "Estreno", value: Math.round(releaseMomentum * 100), tone: "warm" as const }
        ]
      };
    });

  return applyDisplayScores(pickDiverseCandidates(candidates, desiredCount), "upcoming").map((candidate) => ({
    movie: candidate.movie,
    releaseDate: candidate.movie.releaseDateEs ?? candidate.movie.releaseDate!,
    score: candidate.displayScore,
    metrics: candidate.metrics
  }));
}

