/**
 * Resolves with the result of `promise` if it settles within `ms` milliseconds,
 * otherwise rejects with a TimeoutError. The underlying promise keeps running
 * in the background; callers must guard against its late resolution.
 */
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Operation timed out after ${ms}ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });