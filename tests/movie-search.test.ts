import { describe, expect, it } from "vitest";

import { dedupeMovieSearchResults, findStoredMovieForSearchResult, rankMovieSearchResults } from "@/lib/movie-search";
import { Movie } from "@/lib/types";

function movie(input: Partial<Movie> & Pick<Movie, "id" | "slug" | "title" | "year">): Movie {
  return {
    synopsis: "Sinopsis pendiente de enriquecimiento.",
    durationMinutes: 120,
    genres: ["Pendiente"],
    director: "Pendiente",
    cast: [],
    language: "EN",
    country: "Desconocido",
    externalRating: { source: "TMDb", value: "80%" },
    ...input
  };
}

describe("dedupeMovieSearchResults", () => {
  it("deduplicates remote and local movies by TMDb id and keeps richer local metadata", () => {
    const remote = movie({
      id: "tmdb_603",
      slug: "matrix",
      title: "Matrix",
      year: 1999,
      sourceIds: { tmdb: "603" }
    });
    const local = movie({
      id: "movie_tmdb_603",
      slug: "matrix",
      title: "Matrix",
      year: 1999,
      genres: ["Acción", "Ciencia ficción"],
      director: "Lana Wachowski",
      sourceIds: { tmdb: "603" }
    });

    const results = dedupeMovieSearchResults([remote], [local]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "movie_tmdb_603",
      genres: ["Acción", "Ciencia ficción"],
      director: "Lana Wachowski"
    });
  });

  it("uses slug and year as a fallback identity and respects the result limit", () => {
    const duplicateRemote = movie({ id: "remote", slug: "arrival", title: "Arrival", year: 2016 });
    const duplicateLocal = movie({ id: "local", slug: "arrival", title: "La llegada", year: 2016 });
    const other = movie({ id: "other", slug: "arrival-2", title: "Arrival 2", year: 2028 });

    const results = dedupeMovieSearchResults([duplicateRemote, other], [duplicateLocal], 1);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("local");
  });
});

describe("rankMovieSearchResults", () => {
  it("prioritizes an exact title over noisier partial matches", () => {
    const results = rankMovieSearchResults("Matrix", [
      movie({ id: "extra", slug: "sexual-matrix", title: "Sexual Matrix", year: 2000, posterUrl: "poster.jpg" }),
      movie({ id: "exact", slug: "matrix", title: "Matrix", year: 1999 }),
      movie({ id: "other", slug: "dinosaur-matrix", title: "Dinosaur Matrix", year: 2024, posterUrl: "poster.jpg" })
    ]);

    expect(results.map((result) => result.id)).toEqual(["exact", "extra", "other"]);
  });

  it("uses metadata quality to order equally relevant results", () => {
    const results = rankMovieSearchResults("Arrival", [
      movie({ id: "limited", slug: "arrival-remake", title: "Arrival Remake", year: 0 }),
      movie({
        id: "complete",
        slug: "arrival-return",
        title: "Arrival Return",
        year: 2027,
        synopsis: "Una nueva historia.",
        posterUrl: "poster.jpg"
      })
    ]);

    expect(results[0].id).toBe("complete");
  });

  it("matches the original title when TMDb returns a translated title", () => {
    const results = rankMovieSearchResults("Perfect Days", [
      movie({
        id: "unrelated",
        slug: "perfect-days",
        title: "Perfect Days",
        year: 2011,
        popularity: 1,
        voteCount: 4
      }),
      movie({
        id: "wenders",
        slug: "dias-perfectos",
        title: "Días perfectos",
        originalTitle: "Perfect Days",
        year: 2023,
        popularity: 28,
        voteCount: 1_400
      })
    ]);

    expect(results[0].id).toBe("wenders");
  });

  it("uses audience evidence to surface the canonical exact-title result", () => {
    const results = rankMovieSearchResults("Fight Club", [
      movie({
        id: "obscure",
        slug: "fight-club",
        title: "Fight Club",
        year: 2023,
        popularity: 0.2,
        voteCount: 2
      }),
      movie({
        id: "classic",
        slug: "el-club-de-la-lucha",
        title: "El club de la lucha",
        originalTitle: "Fight Club",
        year: 1999,
        popularity: 85,
        voteCount: 31_000
      })
    ]);

    expect(results[0].id).toBe("classic");
  });
});

describe("findStoredMovieForSearchResult", () => {
  it("does not confuse different TMDb movies that share a title and slug", () => {
    const stored = movie({
      id: "movie_tmdb_603",
      slug: "matrix",
      title: "Matrix",
      year: 1999,
      sourceIds: { tmdb: "603" }
    });
    const differentMovie = movie({
      id: "tmdb_411948",
      slug: "matrix",
      title: "Matrix",
      year: 1971,
      sourceIds: { tmdb: "411948" }
    });

    expect(findStoredMovieForSearchResult(differentMovie, [stored])).toBeUndefined();
  });

  it("falls back to slug and year only when TMDb has no identifier", () => {
    const stored = movie({ id: "local", slug: "arrival", title: "La llegada", year: 2016 });
    const matchingResult = movie({ id: "remote", slug: "arrival", title: "Arrival", year: 2016 });
    const otherYear = movie({ id: "other", slug: "arrival", title: "Arrival", year: 2028 });

    expect(findStoredMovieForSearchResult(matchingResult, [stored])?.id).toBe("local");
    expect(findStoredMovieForSearchResult(otherYear, [stored])).toBeUndefined();
  });
});
