export interface RaceHandlers<Value> {
  readonly value: (value: Value) => void;
  readonly error: (error: unknown) => void;
}

export interface Abandonment {
  race<Value>(promise: Promise<Value>, handlers: RaceHandlers<Value>): void;
  abandon(): void;
  pendingCount(): number;
}

interface ReactionCell<Value> {
  value: ((value: Value) => void) | undefined;
  error: ((error: unknown) => void) | undefined;
  release: (() => void) | undefined;
}

export function createAbandonment(): Abandonment {
  const pending = new Set<() => void>();

  return {
    race<Value>(promise: Promise<Value>, handlers: RaceHandlers<Value>) {
      const cell: ReactionCell<Value> = { ...handlers, release: undefined };
      const release = () => {
        pending.delete(release);
        cell.value = undefined;
        cell.error = undefined;
        cell.release = undefined;
      };
      cell.release = release;
      pending.add(release);
      void promise.then(
        (value) => {
          const handler = cell.value;
          cell.release?.();
          handler?.(value);
        },
        (error: unknown) => {
          const handler = cell.error;
          cell.release?.();
          handler?.(error);
        },
      );
    },
    abandon() {
      for (const release of [...pending]) release();
    },
    pendingCount: () => pending.size,
  };
}
