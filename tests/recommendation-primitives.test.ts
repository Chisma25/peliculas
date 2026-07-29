import { describe, expect, it } from "vitest";

import {
  getMovieDecade,
  normalizeFeatureMap,
  normalizeText,
  parseExternalRating,
  uniqueNormalized
} from "../src/lib/recommendation-primitives";
import type { Movie } from "../src/lib/types";

function movieWithRating(value: string): Movie {
  return {
    id: "movie_test",
    slug: "movie-test",
    title: "Película de prueba",
    year: 1999,
    synopsis: "",
    durationMinutes: 100,
    genres: [],
    director: "",
    cast: [],
    language: "",
    country: "",
    posterUrl: "",
    externalRating: { source: "Test", value }
  };
}

describe("recommendation primitives", () => {
  it("normalizes text and removes duplicate semantic labels", () => {
    expect(normalizeText("  Ciencia Ficción  ")).toBe("ciencia ficcion");
    expect(uniqueNormalized(["Drama", "dráma", "Comedia"])).toEqual(["drama", "comedia"]);
  });

  it("normalizes feature maps without changing their relative weight", () => {
    expect(normalizeFeatureMap({ drama: 4, comedia: -2 })).toEqual({ drama: 1, comedia: -0.5 });
  });

  it("parses common external rating formats on the same ten-point scale", () => {
    expect(parseExternalRating(movieWithRating("84%"))).toBe(8.4);
    expect(parseExternalRating(movieWithRating("7.5/10"))).toBe(7.5);
    expect(parseExternalRating(movieWithRating("92/100"))).toBe(9.2);
  });

  it("groups valid movie years by decade", () => {
    expect(getMovieDecade(movieWithRating("8"))).toBe("1990s");
  });
});
