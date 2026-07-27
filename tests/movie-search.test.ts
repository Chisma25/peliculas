import { describe, expect, it } from "vitest";

import { dedupeMovieSearchResults } from "@/lib/movie-search";
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
