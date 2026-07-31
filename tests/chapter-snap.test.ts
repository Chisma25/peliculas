import { describe, expect, it } from "vitest";

import { getDirectionalSnapTarget } from "@/lib/chapter-snap";

const snapPoints = [0, 640, 1280];

describe("directional chapter assistance", () => {
  it("leaves the scroll untouched while the next chapter is still far away", () => {
    expect(
      getDirectionalSnapTarget({
        currentPosition: 260,
        direction: 1,
        snapPoints,
        threshold: 110
      })
    ).toBeNull();
  });

  it("finishes the short remaining distance in the direction of travel", () => {
    expect(
      getDirectionalSnapTarget({
        currentPosition: 570,
        direction: 1,
        snapPoints,
        threshold: 110
      })
    ).toBe(640);
  });

  it("never pulls the user backwards after a downward gesture", () => {
    expect(
      getDirectionalSnapTarget({
        currentPosition: 70,
        direction: 1,
        snapPoints,
        threshold: 110
      })
    ).toBeNull();
  });

  it("only assists upwards when the previous chapter is already close", () => {
    expect(
      getDirectionalSnapTarget({
        currentPosition: 710,
        direction: -1,
        snapPoints,
        threshold: 110
      })
    ).toBe(640);
  });
});
