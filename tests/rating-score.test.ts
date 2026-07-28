import { describe, expect, it } from "vitest";

import { formatMovieCountry, formatMovieLanguage, formatScore, isQuarterPointScore } from "@/lib/utils";

describe("quarter-point ratings", () => {
  it.each([0, 0.25, 7.25, 7.5, 7.75, 8, 9.25, 10])(
    "accepts %s",
    (score) => {
      expect(isQuarterPointScore(score)).toBe(true);
    }
  );

  it.each([-0.25, 7.3, 7.8, 9.4, 10.25, Number.NaN])(
    "rejects %s",
    (score) => {
      expect(isQuarterPointScore(score)).toBe(false);
    }
  );

  it("preserves quarter precision when formatting", () => {
    expect(formatScore(7.25)).toBe("7,25");
    expect(formatScore(7.5)).toBe("7,5");
    expect(formatScore(7.75)).toBe("7,75");
    expect(formatScore(8)).toBe("8");
  });
});

describe("movie metadata labels", () => {
  it("localizes common TMDb language and country labels", () => {
    expect(formatMovieLanguage("English")).toBe("Inglés");
    expect(formatMovieLanguage("JA")).toBe("Japonés");
    expect(formatMovieCountry("United States of America")).toBe("Estados Unidos");
    expect(formatMovieCountry("Japan")).toBe("Japón");
  });

  it("turns unknown metadata into a consistent pending label", () => {
    expect(formatMovieLanguage("Desconocido")).toBe("Pendiente");
    expect(formatMovieCountry("Unknown")).toBe("Pendiente");
  });
});
