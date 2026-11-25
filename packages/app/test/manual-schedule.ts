import type { Schedule } from '../src/map-embedding/map-embedding';

/**
 * A {@link Schedule} that runs nothing until a test advances it, so a test
 * says when time passes rather than mocking the ambient timer (ADR 0109).
 */
export function manualSchedule() {
  let now = 0;
  let pending: { readonly at: number; readonly run: () => void }[] = [];
  const schedule: Schedule = (run, delayMs) => {
    const entry = { at: now + delayMs, run };
    pending.push(entry);
    return () => {
      pending = pending.filter((candidate) => candidate !== entry);
    };
  };
  return {
    schedule,
    /** Lets `ms` pass, running each scheduled callback that falls due, in order. */
    advance: (ms: number): void => {
      const until = now + ms;
      for (;;) {
        const due = pending.filter((entry) => entry.at <= until).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        pending = pending.filter((entry) => entry !== due);
        now = due.at;
        due.run();
      }
      now = until;
    },
  };
}
