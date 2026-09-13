/**
 * Resolves with the result of `promise` if it settles within `ms`
 * milliseconds, otherwise rejects with a `TimeoutError`.
 *
 * The underlying promise is NOT magically stopped — JS has no way to cancel an
 * arbitrary promise. For network calls, pass `onTimeout` to actively abort the
 * request (e.g. `() => controller.abort()`), so a timed-out request stops
 * consuming a socket / connection-pool slot instead of running to completion
 * in the background. Callers must still guard against the abandoned promise's
 * late rejection (it is swallowed here).
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout?.();
      } catch {
        // aborting is best-effort — never let it mask the timeout
      }
      const error = new Error(`Operation timed out after ${ms}ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
