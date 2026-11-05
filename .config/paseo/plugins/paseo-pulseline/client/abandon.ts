export interface RaceHandlers<Value> {
  readonly value: (value: Value) => void;
  readonly error: (error: unknown) => void;
  readonly abandonedValue?: (value: Value) => void;
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
  abandonedValue?: ((value: Value) => void) | undefined;
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
          if (handler) handler(value);
          else cell.abandonedValue?.(value);
          cell.abandonedValue = undefined;
        },
        (error: unknown) => {
          const handler = cell.error;
          cell.release?.();
          handler?.(error);
          cell.abandonedValue = undefined;
        },
      );
    },
    abandon() {
      for (const release of [...pending]) release();
    },
    pendingCount: () => pending.size,
  };
}
