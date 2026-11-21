export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class Semaphore {
  #available: number;
  readonly #waiting: (() => void)[] = [];

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity must be a positive integer");
    this.#available = capacity;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.#available > 0) this.#available--;
    else await new Promise<void>((resolve) => this.#waiting.push(resolve));

    try {
      return await task();
    } finally {
      const next = this.#waiting.shift();
      if (next) next();
      else this.#available++;
    }
  }
}
