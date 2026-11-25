// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportPackageButton } from './ImportPackageButton';

const session = vi.hoisted(() => ({
  snapshot: { packages: {}, states: {} } as { packages: Record<string, { id: string; name: string }>; states: Record<string, string> },
  reselect: vi.fn(), requestAccess: vi.fn(), subscribe: vi.fn(() => () => {}), // eslint-disable-line unicorn/consistent-function-scoping -- vi.hoisted requires the mock factory in this scope.
}));
vi.mock('../../utils/companion', () => ({
  getSnapshot: () => session.snapshot,
  subscribe: session.subscribe,
  reselect: session.reselect,
  requestAccess: session.requestAccess,
}));
import { PackageStatusPanel } from './PackageStatusPanel';

describe('ImportPackageButton', () => {
  beforeEach(() => { vi.stubGlobal('showOpenFilePicker', undefined); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('uses the ZIP-only fallback input when the native picker is unavailable', () => {
    render(<ImportPackageButton onFiles={vi.fn()} onError={vi.fn()} />);
    const input = screen.getByLabelText('Select companion ZIP package') as HTMLInputElement;
    expect(input.accept).toBe('.zip,application/zip');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Open companion ZIP package' }));
    expect(click).toHaveBeenCalledOnce();
  });

  it('silently ignores native picker aborts', async () => {
    const onError = vi.fn();
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')));
    render(<ImportPackageButton onFiles={vi.fn()} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open companion ZIP package' }));
    await waitFor(() => expect(onError).not.toHaveBeenCalled());
  });
});

describe('PackageStatusPanel', () => {
  afterEach(cleanup);
  it('shows each saved status and exposes reopen and select-again actions', async () => {
    session.snapshot = {
      packages: Object.fromEntries(['available', 'needs-permission', 'missing', 'mismatch', 'unselected'].map((state) => [state, { id: state, name: `${state}.zip` }])),
      states: { available: 'available', 'needs-permission': 'needs-permission', missing: 'missing', mismatch: 'mismatch', unselected: 'unselected' },
    };
    session.requestAccess.mockResolvedValue({ ok: true });
    session.reselect.mockResolvedValue({ ok: true });
    const onReselect = vi.fn().mockResolvedValue(undefined);
    render(<PackageStatusPanel onReselect={onReselect} />);
    for (const label of ['Available', 'Needs permission', 'Missing', 'Mismatch', 'Unselected']) expect(screen.getByText(label)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(session.requestAccess).toHaveBeenCalledWith('available'));
    const selector = screen.getByLabelText('Select missing.zip again');
    fireEvent.change(selector, { target: { files: [new File(['zip'], 'retry.zip')] } });
    await waitFor(() => expect(session.reselect).toHaveBeenCalledWith('missing', expect.any(File)));
    expect(onReselect).toHaveBeenCalledWith(expect.any(File), 'missing');
  });
});
