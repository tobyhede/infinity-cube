/**
 * Run `body`, then every one of `cleanup` in order, whether or not `body` or an
 * earlier step failed. The failure reported is the first: `body`'s, or else the
 * first failing step's. So a step that fails (a host that will not stop)
 * neither skips the steps after it nor replaces why `body` failed.
 */
export const runWithCleanup = async (
  body: () => Promise<void>,
  cleanup: readonly (() => Promise<void>)[],
): Promise<void> => {
  const failures: unknown[] = [];
  try {
    await body();
  } catch (error) {
    failures.push(error);
  }
  for (const step of cleanup) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw failures[0];
};
