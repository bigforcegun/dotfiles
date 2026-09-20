// Request deadlines owned by the store, not by the promise they guard.
//
// Two failure modes are handled here. A request that never settles must not leave
// its timer armed after unmount, and clearing must not leave the guard promise
// pending: an awaiting continuation would stay suspended for the lifetime of the
// process, once per mount/unmount cycle.

export interface DeadlineKeeper {
  /** Rejects the returned promise when `work` outlives `ms`, or when `clear()` runs. */
  run<Value>(work: Promise<Value>, ms: number): Promise<Value>;
  /** Cancels every armed deadline and settles every guard it still owns. */
  clear(): void;
  armed(): number;
}

interface ArmedDeadline {
  readonly handle: unknown;
  readonly reject: (reason: Error) => void;
}

export function createDeadlineKeeper(
  schedule: (callback: () => void, ms: number) => unknown,
  cancel: (handle: unknown) => void,
): DeadlineKeeper {
  const armed = new Set<ArmedDeadline>();

  return {
    run(work, ms) {
      let entry: ArmedDeadline | null = null;
      const disarm = () => {
        if (!entry) return;
        armed.delete(entry);
        cancel(entry.handle);
        entry = null;
      };
      const deadline = new Promise<never>((_resolve, reject) => {
        const handle = schedule(() => {
          disarm();
          reject(new Error("timeline request timed out"));
        }, ms);
        entry = { handle, reject };
        armed.add(entry);
      });
      const guarded = Promise.race([work, deadline]).finally(disarm);
      // The caller keeps its own handler; this one only stops Node from reporting
      // an unhandled rejection when a guard is cleared and nobody was waiting.
      void guarded.catch(() => undefined);
      return guarded;
    },
    clear() {
      for (const entry of [...armed]) {
        armed.delete(entry);
        cancel(entry.handle);
        // Settle the guard so its awaiting continuation resumes and is collected.
        entry.reject(new Error("timeline request abandoned"));
      }
    },
    armed: () => armed.size,
  };
}
