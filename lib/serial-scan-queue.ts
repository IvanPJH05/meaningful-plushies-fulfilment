/** Keep scanner bursts in arrival order while earlier network requests finish. */
export function createSerialScanQueue<T>(options: {
  process: (scan: T) => Promise<void>;
  canProcess: () => boolean;
  onError: (error: unknown) => void;
}) {
  let pending: T[] = [];
  let running = false;
  let disposed = false;

  async function drain() {
    if (running || disposed || !options.canProcess()) return;
    running = true;
    try {
      while (!disposed && pending.length && options.canProcess()) {
        await options.process(pending.shift()!);
      }
    } catch (error) {
      // Do not apply leftover scans to a different parcel after a failure.
      pending = [];
      options.onError(error);
    } finally {
      running = false;
    }
  }

  return {
    enqueue(scan: T) {
      if (disposed) return;
      pending.push(scan);
      void drain();
    },
    resume() { void drain(); },
    clear() { pending = []; },
    dispose() { disposed = true; pending = []; },
  };
}
