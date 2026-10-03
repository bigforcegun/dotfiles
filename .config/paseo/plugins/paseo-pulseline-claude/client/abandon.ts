// Plugin-owned abandonment.
//
// Paseo v0.8 exposes no cancellation on its promises: a host call that never
// settles cannot be aborted from here. What the plugin can own is its own wait.
// Every guarded wait is raced against an abandonment that cleanup/stop settles,
// so no continuation of ours survives teardown, and the raw promise keeps a
// terminal handler so a late rejection is never reported as unhandled.

export interface Abandonment {
  /** Resolves/rejects with `work`, or rejects as soon as `abandon()` runs. */
  race<Value>(work: Promise<Value>): Promise<Value>;
  abandon(): void;
  outstanding(): number;
}

export function createAbandonment(): Abandonment {
  const waiting = new Set<(reason: Error) => void>();
  let abandoned = false;

  return {
    race(work) {
      // The raw promise outlives us; make sure nobody reports it as unhandled.
      void work.catch(() => undefined);
      if (abandoned) return Promise.reject(new Error("abandoned"));
      let release: ((reason: Error) => void) | null = null;
      const abandonment = new Promise<never>((_resolve, reject) => {
        release = reject;
        waiting.add(reject);
      });
      const guarded = Promise.race([work, abandonment]).finally(() => {
        if (release) waiting.delete(release);
      });
      void guarded.catch(() => undefined);
      return guarded;
    },
    abandon() {
      abandoned = true;
      for (const reject of [...waiting]) {
        waiting.delete(reject);
        reject(new Error("abandoned"));
      }
    },
    outstanding: () => waiting.size,
  };
}
