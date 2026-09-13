import { ENV } from '../config/env';

/**
 * Lightweight startup timeline instrumentation.
 *
 * `t0` is fixed at JS-bundle load. Every `mark(name)` logs the elapsed time
 * since then, so the real cost of each startup phase can be read straight off
 * the Metro / device console:
 *
 *   [STARTUP] +0ms      bundle:loaded
 *   [STARTUP] +312ms    App:render-start
 *   [STARTUP] +540ms    authStore.hydrate:enter
 *   [STARTUP] +560ms    SecureStore.getItemAsync:start key=auth.access_token
 *   [STARTUP] +575ms    SecureStore.getItemAsync:end key=auth.access_token
 *   [STARTUP] +590ms    authStore.hydrate:getTokenPair-returned hasToken=false
 *   [STARTUP] +592ms    authStore.hydrate:done
 *   [STARTUP] ⏱ hydrate:auth = 1856ms ok  (invoked @+540ms)   <- cross-check vs :done above
 *   [STARTUP] +690ms    dashboard:shell-visible
 *
 * Dev-only (no-op in release). Safe to leave in — it costs one Date.now() and
 * a string per mark, all gated behind `__DEV__`.
 */
const t0 = Date.now();

let lastMarkAt = t0;

export const startupTrace = {
  /** Milliseconds since JS bundle load. */
  now: (): number => Date.now() - t0,

  mark: (name: string, meta?: Record<string, unknown>): void => {
    if (!ENV.isDev) return;
    const at = Date.now();
    const sinceStart = at - t0;
    const sinceLast = at - lastMarkAt;
    lastMarkAt = at;
    const metaStr = meta
      ? ' ' +
        Object.entries(meta)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(' ')
      : '';
    console.log(`[STARTUP] +${sinceStart}ms (+${sinceLast}ms) ${name}${metaStr}`);
  },

  /**
   * Times an async operation under `name`. Logs the elapsed time AND the
   * invocation offset (`@+<X>ms` from t0). The elapsed time is measured from
   * this continuation resuming, so if the JS thread is blocked between `fn()`
   * settling and this line running, the blocked time is included. Cross-check
   * against any synchronous `mark()` the operation itself takes just before it
   * returns: a gap between that mark's `+Nms` and (`@+X` + elapsed) here is
   * microtask starvation, not real cost.
   */
  measure: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    if (!ENV.isDev) return fn();
    const started = Date.now();
    const invokedAtOffset = started - t0;
    try {
      const result = await fn();
      console.log(`[STARTUP] ⏱ ${name} = ${Date.now() - started}ms ok  (invoked @+${invokedAtOffset}ms)`);
      return result;
    } catch (error) {
      console.log(`[STARTUP] ⏱ ${name} = ${Date.now() - started}ms ERROR ${(error as Error)?.message ?? error}  (invoked @+${invokedAtOffset}ms)`);
      throw error;
    }
  },
};
