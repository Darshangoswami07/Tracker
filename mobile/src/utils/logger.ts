import { ENV } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const PREFIX = '[DeliveryHub]';

/** Minimal structured logger that is a no-op in production builds. */
export const getLogger = (scope: string) => {
  const write = (level: LogLevel, message: string, meta?: unknown) => {
    if (!ENV.isDev) return;
    const payload = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
    const line = `${PREFIX} ${scope} ${level}: ${message}${payload}`;
    // eslint-disable-next-line no-console
    console[level](line);
  };

  return {
    debug: (message: string, meta?: unknown) => write('debug', message, meta),
    info: (message: string, meta?: unknown) => write('info', message, meta),
    warn: (message: string, meta?: unknown) => write('warn', message, meta),
    error: (message: string, meta?: unknown) => write('error', message, meta),
  };
};