/**
 * Run an abortable async task with a hard timeout (pure — unit testable). Used to
 * guarantee the Telegram bootstrap always settles: if the auth request hangs, the
 * task's AbortSignal is aborted (cancelling the underlying fetch — no orphan
 * request) and the promise rejects with TimeoutError, so the caller can move to a
 * recoverable "error" state instead of loading forever. Each call creates a fresh
 * AbortController, so a retry starts a clean attempt.
 */
export class TimeoutError extends Error {
  constructor(message = "timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function runWithTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new TimeoutError());
    }, timeoutMs);

    task(controller.signal).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
