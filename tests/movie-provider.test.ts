import { describe, expect, it } from "vitest";

import { mapDetailsToMovie, mapSearchResultToMovie } from "@/lib/movie-provider";

describe("TMDb movie mapping", () => {
  it("keeps the original title and ranking signals from search results", () => {
    const movie = mapSearchResultToMovie({
      id: 976893,
      title: "Días perfectos",
      original_title: "Perfect Days",
      original_language: "ja",
      release_date: "2023-11-10",
      popularity: 27.4,
      vote_count: 1_400
    });

    expect(movie).toMatchObject({
      originalTitle: "Perfect Days",
      language: "Japonés",
      metadataVersion: 2,
      popularity: 27.4,
      voteCount: 1_400
    });
  });

  it("uses original_language instead of the first spoken language", () => {
    const movie = mapDetailsToMovie({
      id: 872585,
      title: "Oppenheimer",
      original_language: "en",
      release_date: "2023-07-19",
      spoken_languages: [
        { english_name: "Dutch", name: "Nederlands" },
        { english_name: "English", name: "English" }
      ]
    });

    expect(movie).toMatchObject({ language: "Inglés", metadataVersion: 2 });
  });
});
