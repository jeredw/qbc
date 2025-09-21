export class Scheduler {
  constructor(private abortController: AbortController = new AbortController()) {
  }

  abort() {
    this.abortController.abort();
  }

  schedule({start, cancel}: {
    start: (resolve: () => void, reject: () => void) => void,
    cancel?: () => void
  }): Promise<void> {
    const signal = this.abortController.signal;
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        cancel?.();
        return reject(signal.reason);
      }
      signal.addEventListener('abort', () => {
        cancel?.();
        reject(signal.reason);
      });
      start(resolve, reject);
    });
  }
}