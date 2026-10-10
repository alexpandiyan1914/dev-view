/**
 * One place that handles Ctrl+C for the whole program.
 *
 * Why: Node runs every SIGINT listener in order, and the first one that calls process.exit()
 * stops the rest from ever running. So instead of many separate listeners, other code
 * registers a small cleanup function here, and this single handler runs them all before exiting.
 */
const cleanups = new Set<() => void>();

/** Registers a cleanup to run on Ctrl+C. Returns a function that unregisters it. */
export function onInterrupt(cleanup: () => void): () => void {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

export function installInterruptHandler(): void {
  process.on("SIGINT", () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // a failing cleanup must not stop the others
      }
    }
    process.stdout.write("\x1B[?25h"); // show the cursor again
    process.stdout.write("\n\x1B[31m✖ Analysis interrupted by user.\x1B[0m\n");
    process.exit(130); // 130 is the standard exit code for "stopped with Ctrl+C"
  });
}