import { describe, expect, it } from "vitest";

import { getMovieDetailArtwork } from "@/lib/movie-artwork";
import type { Movie } from "@/lib/types";

const baseMovie: Movie = {
  id: "movie_1",
  slug: "example",
  title: "Example",
  year: 2026,
  synopsis: "Synopsis",
  durationMinutes: 120,
  genres: ["Drama"],
  director: "Director",
  cast: [],
  language: "Spanish",
  country: "Spain",
  externalRating: { source: "TMDb", value: "80%" }
};

describe("movie detail artwork", () => {
  it("keeps the horizontal backdrop separate from the poster", () => {
    expect(
      getMovieDetailArtwork({
        ...baseMovie,
        posterUrl: "https://images.test/poster.jpg",
        backdrop: "https://images.test/backdrop.jpg"
      })
    ).toEqual({
      backdrop: "https://images.test/backdrop.jpg",
      poster: "https://images.test/poster.jpg",
      usesPosterFallback: false
    });
  });

  it("marks the poster as an ambient fallback when no backdrop exists", () => {
    expect(
      getMovieDetailArtwork({
        ...baseMovie,
        posterUrl: "https://images.test/poster.jpg"
      })
    ).toEqual({
      backdrop: "https://images.test/poster.jpg",
      poster: "https://images.test/poster.jpg",
      usesPosterFallback: true
    });
  });

  it("treats a duplicated poster and backdrop as an ambient fallback", () => {
    expect(
      getMovieDetailArtwork({
        ...baseMovie,
        posterUrl: "https://images.test/shared.jpg",
        backdrop: "https://images.test/shared.jpg"
      })
    ).toEqual({
      backdrop: "https://images.test/shared.jpg",
      poster: "https://images.test/shared.jpg",
      usesPosterFallback: true
    });
  });
});
