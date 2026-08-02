type DirectionalSnapInput = {
  currentPosition: number;
  direction: -1 | 1;
  snapPoints: number[];
  threshold: number;
};

export function getDirectionalSnapTarget({
  currentPosition,
  direction,
  snapPoints,
  threshold
}: DirectionalSnapInput) {
  const orderedPoints = [...snapPoints].sort((left, right) => left - right);
  const forwardTarget =
    direction > 0
      ? orderedPoints.find((point) => point > currentPosition + 2)
      : [...orderedPoints].reverse().find((point) => point < currentPosition - 2);

  if (
    forwardTarget !== undefined &&
    Math.abs(forwardTarget - currentPosition) <= threshold
  ) {
    return forwardTarget;
  }

  // A wheel gesture can coast a few pixels past a chapter boundary. Correct that
  // small overshoot without dragging the user back from a deliberate scroll.
  const crossedTarget =
    direction > 0
      ? [...orderedPoints].reverse().find((point) => point < currentPosition - 2)
      : orderedPoints.find((point) => point > currentPosition + 2);
  const overshootThreshold = Math.min(threshold, 64);

  if (
    crossedTarget === undefined ||
    Math.abs(crossedTarget - currentPosition) > overshootThreshold
  ) {
    return null;
  }

  return crossedTarget;
}
