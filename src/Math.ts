const TINY = 3e-324;

export function roundToNearestEven(number: number): number {
  return number * TINY / TINY;
}

export function clamp(x: number, min: number, max: number): number {
  if (x < min) {
    return min;
  }
  if (x > max) {
    return max;
  }
  return x;
}