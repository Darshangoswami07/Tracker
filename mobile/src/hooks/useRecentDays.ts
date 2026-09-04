import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

const DEFAULT_DAY_COUNT = 14;

/** Local-midnight copy of a date (drops the time component). */
const startOfLocalDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const isSameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * The current local calendar day ("today") plus the most recent `count` days
 * in descending order — for a date picker.
 *
 * The list is ALWAYS anchored to the real current date, never to any
 * user-selected date, so "Today" is always the first entry. `selectedDate`
 * lives in the caller and only controls which row is highlighted.
 *
 * The anchor stays live with no app restart:
 *   - re-checked whenever the app returns to the foreground (device asleep
 *     across midnight), and
 *   - via a self-rearming timer that fires just after the next local midnight.
 * So at 00:00 the new day silently becomes "today", the list shifts down by
 * one, and older days stay correctly ordered. Uses the device's local
 * calendar throughout (no UTC boundaries), consistent with the rest of the
 * date formatting in these screens.
 */
export const useRecentDays = (count: number = DEFAULT_DAY_COUNT) => {
  const [today, setToday] = useState<Date>(() => startOfLocalDay(new Date()));

  const refresh = useCallback(() => {
    setToday((prev) => {
      const now = startOfLocalDay(new Date());
      return isSameCalendarDay(prev, now) ? prev : now;
    });
  }, []);

  useEffect(() => {
    // `today` is seeded from `new Date()` in the useState initialiser on every
    // mount, so no reconciliation is needed here on mount. It only needs to
    // stay live *while mounted*: on foreground and at the next local midnight.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    let midnightTimer: ReturnType<typeof setTimeout>;
    const armMidnightTimer = () => {
      const now = new Date();
      const nextMidnight = startOfLocalDay(now);
      nextMidnight.setDate(nextMidnight.getDate() + 1);
      // +1s so the callback runs safely inside the new day.
      const delay = nextMidnight.getTime() - now.getTime() + 1000;
      midnightTimer = setTimeout(() => {
        refresh();
        armMidnightTimer();
      }, delay);
    };
    armMidnightTimer();

    return () => {
      appStateSub.remove();
      clearTimeout(midnightTimer);
    };
  }, [refresh]);

  const recentDays = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        return d;
      }),
    [today, count],
  );

  return { today, recentDays, refresh };
};
