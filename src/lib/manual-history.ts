import { manualHistoryRows } from "@/lib/manual-history-data";
import { Movie, User, UserRating, WatchEntry } from "@/lib/types";
import { slugify } from "@/lib/utils";

type ManualHistorySeed = {
  users: User[];
  movies: Movie[];
  ratings: UserRating[];
  watchEntries: WatchEntry[];
};

const RESERVED_COLUMNS = new Set(["titulo", "ano", "fecha"]);

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function makeUserId(name: string) {
  return `user_${slugify(name)}`;
}

function makeMovieId(title: string) {
  return `movie_${slugify(title)}`;
}

export function loadManualHistorySeed(): ManualHistorySeed | null {
  const rows = [...manualHistoryRows];
  if (rows.length === 0) {
    return null;
  }

  const headers = Object.keys(rows[0]);
  const ratingColumns = headers.filter((header) => !RESERVED_COLUMNS.has(normalizeHeader(header)));

  const users: User[] = ratingColumns.map((name) => ({
    id: makeUserId(name),
    name,
    username: name,
    email: `${slugify(name)}@cine.local`,
    avatarSeed: slugify(name),
    passwordHash: ""
  }));

  const movies: Movie[] = [];
  const ratings: UserRating[] = [];
  const watchEntries: WatchEntry[] = [];

  for (const row of rows) {
    const title = String(row.Titulo ?? "").trim();
    if (!title) {
      continue;
    }

    const yearText = String((row as Record<string, string>)["Año"] ?? "").trim();
    const year = Number.parseInt(yearText, 10);
    const watchedOnText = String(row.Fecha ?? "").trim();
    const watchedOnDate = watchedOnText ? new Date(watchedOnText) : null;
    const movieId = makeMovieId(title);

    movies.push({
      id: movieId,
      slug: slugify(title),
      title,
      year: Number.isFinite(year) ? year : 0,
      synopsis: "Pendiente de enriquecer desde TMDb.",
      durationMinutes: 0,
      genres: ["Pendiente"],
      director: "Pendiente",
      cast: [],
      language: "Desconocido",
      country: "Desconocido",
      externalRating: {
        source: "TMDb",
        value: "N/D"
      }
    });

    watchEntries.push({
      id: `watch_${slugify(title)}`,
      movieId,
      groupId: "group_cine_club",
      watchedOn: watchedOnDate && !Number.isNaN(watchedOnDate.getTime()) ? watchedOnDate.toISOString() : undefined
    });

    for (const user of users) {
      const rawScore = String(row[user.name as keyof typeof row] ?? "").trim();
      const score = Number.parseFloat(rawScore.replace(",", "."));
      if (!Number.isFinite(score)) {
        continue;
      }

      ratings.push({
        id: `rating_${slugify(title)}_${slugify(user.name)}`,
        movieId,
        userId: user.id,
        score
      });
    }
  }

  return {
    users,
    movies,
    ratings,
    watchEntries
  };
}
