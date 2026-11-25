import { describe, expect, it, vi } from "vitest";
import type { PreviewSession } from "../../src/types.js";
import { TuiController } from "../../src/tui/controller.js";

/**
 * Return a minimal preview session with a tracked disposal callback.
 *
 * @param dispose Callback invoked when the session is disposed.
 * @returns A minimal session suitable for lifecycle tests.
 */
function session(dispose: () => void): PreviewSession {
  return { results: [], retry: async () => { throw new Error("unused"); }, dispose: async () => { dispose(); } };
}

describe("TuiController lifecycle", () => {
  it("waits for active work before disposing exactly once", async () => {
    const controller = new TuiController();
    const dispose = vi.fn();
    let finish: (() => void) | undefined;
    // Promise.withResolvers is not included in the configured ES2023 library.
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
    const operation = controller.run(async () => new Promise<void>((resolve) => { finish = resolve; }));
    await controller.retainSession(session(dispose), new AbortController().signal);
    const cleanup = controller.dispose();
    expect(dispose).not.toHaveBeenCalled();
    finish?.();
    await Promise.all([operation, cleanup, controller.dispose()]);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes a session returned after its generation was aborted", async () => {
    const controller = new TuiController();
    const aborter = new AbortController();
    const dispose = vi.fn();
    aborter.abort();
    await expect(controller.retainSession(session(dispose), aborter.signal)).resolves.toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
