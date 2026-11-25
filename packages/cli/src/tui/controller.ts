import type { PreviewSession } from "../types.js";

/** Coordinates cancellable TUI work and owns the preview session lifetime. */
export class TuiController {
  private active: AbortController | null = null;
  private readonly pending = new Set<Promise<void>>();
  private session: PreviewSession | null = null;
  private disposed = false;
  private generation = 0;

  /**
   * Current monotonically increasing operation identifier.
   *
   * @returns The latest allocated operation identifier.
   */
  public get runId(): number { return this.generation; }

  /**
   * Preview session retained for retries and writing.
   *
   * @returns The currently owned preview session, if one exists.
   */
  public get previewSession(): PreviewSession | null { return this.session; }

  /**
   * Run one operation and reject all late state updates through its run id.
   *
   * @param work An abortable operation that may return a stage result.
   * @returns The operation result when current, or undefined when aborted or stale.
   */
  public async run<T>(work: (signal: AbortSignal, runId: number) => Promise<T>): Promise<T | undefined> {
    this.active?.abort();
    const aborter = new AbortController();
    this.active = aborter;
    const runId = ++this.generation;
    const task = work(aborter.signal, runId);
    const settled = task.then(() => {}).catch(() => {});
    this.pending.add(settled);
    void settled.finally(() => this.pending.delete(settled));
    try {
      const result = await task;
      return aborter.signal.aborted || runId !== this.generation ? undefined : result;
    } catch (error) {
      if (aborter.signal.aborted || runId !== this.generation) return undefined;
      throw error;
    } finally {
      if (this.active === aborter) this.active = null;
    }
  }

  /**
   * Retain a newly-created preview session, disposing it if cancellation won the race.
   *
   * @param session The session returned by preview generation.
   * @param signal The generation signal used to detect late results.
   * @returns Whether the session became the controller's current session.
   */
  public async retainSession(session: PreviewSession, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted || this.disposed) {
      await session.dispose();
      return false;
    }
    this.session = session;
    return true;
  }

  /**
   * Invalidate in-flight results and wait for the operation to settle.
   *
   * @returns A promise resolved after all operations settle.
   */
  public async cancel(): Promise<void> {
    ++this.generation;
    this.active?.abort();
    await Promise.all(this.pending);
  }

  /**
   * Dispose the owned preview session exactly once after in-flight work settles.
   *
   * @returns A promise resolved after owned preview artifacts are removed.
   */
  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.cancel();
    await this.disposeSession();
  }

  /**
   * Dispose previews while keeping the controller available for a later generation.
   *
   * @returns A promise resolved after the session is removed.
   */
  public async disposeSession(): Promise<void> {
    await this.cancel();
    await this.finishSession();
  }

  /**
   * Dispose the session after a caller has awaited its last stage operation.
   *
   * @returns A promise resolved after the session is removed.
   */
  public async finishSession(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (session) await session.dispose();
  }
}
