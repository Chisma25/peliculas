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
  const target =
    direction > 0
      ? orderedPoints.find((point) => point > currentPosition + 2)
      : [...orderedPoints].reverse().find((point) => point < currentPosition - 2);

  if (target === undefined || Math.abs(target - currentPosition) > threshold) {
    return null;
  }

  return target;
}
