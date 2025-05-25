export function roundToNearestEven(number: number): number {
  return 2 * Math.round(number / 2);
}