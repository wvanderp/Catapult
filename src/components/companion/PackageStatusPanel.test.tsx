// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { reselect, getSnapshot } = vi.hoisted(() => ({ reselect: vi.fn(), getSnapshot: vi.fn() }));
/**
 * Provide a successful callback without side effects.
 *
 * @returns A resolved callback promise.
 */
function noopReselect(): Promise<void> { return Promise.resolve(); }
/**
 * Subscribe without registering listeners in the mocked panel test.
 *
 * @returns The no-op unsubscribe callback.
 */
function noopSubscribe(): () => void { return noopUnsubscribe; }
/**
 * Unsubscribe from the mocked package snapshot.
 */
function noopUnsubscribe(): void {}
vi.mock("../../utils/companion", () => ({
  getSnapshot,
  subscribe: noopSubscribe,
  reselect,
  requestAccess: vi.fn(),
}));
import { PackageStatusPanel } from "./PackageStatusPanel";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PackageStatusPanel typed errors", () => {
  it.each([
    ["mismatch", "Selected package originals do not match saved work"],
    ["invalid", "Invalid ZIP archive"],
    ["missing", "File no longer exists"],
    ["permission", "Read permission was not granted"],
  ] as const)("shows the %s message returned by reselect", async (_reason, message) => {
    getSnapshot.mockReturnValue({ packages: { saved: { id: "saved", name: "photos.zip" } }, states: { saved: "unselected" } });
    reselect.mockResolvedValue({ ok: false, reason: _reason, message });
    render(<PackageStatusPanel onReselect={noopReselect} />);
    fireEvent.change(screen.getByLabelText("Select photos.zip again"), { target: { files: [new File(["zip"], "photos.zip")] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(message));
  });
});
