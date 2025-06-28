export class DebugState {
  breakpoints: Set<number> = new Set();
  pauseLine?: number;
  blockForIo?: (boolean) => void;
}
