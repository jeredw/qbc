const TINY = 3e-324;

export function roundToNearestEven(number: number): number {
  return number * TINY / TINY;
}