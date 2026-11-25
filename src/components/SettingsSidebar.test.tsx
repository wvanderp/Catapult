// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsSidebar } from './SettingsSidebar';
import { useSettingsStore } from '../store/settingsStore';

const mocks = vi.hoisted(() => ({ clearDatabase: vi.fn(), clearCompanionDatabase: vi.fn(), clearAllImages: vi.fn() }));
vi.mock('../utils/indexedDbStorage', () => ({ clearDatabase: mocks.clearDatabase }));
vi.mock('../utils/companion', () => ({ clearCompanionDatabase: mocks.clearCompanionDatabase }));
vi.mock('../store/imageSetStore', () => ({ useImageSetStore: (selector: (state: { clearAllImages: () => Promise<void> }) => unknown) => selector({ clearAllImages: mocks.clearAllImages }) }));
vi.mock('../hooks/useWikimediaCommons', () => ({ useWikimediaCommons: () => ({ logout: vi.fn(), isAuthenticated: false, userName: undefined }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.clearDatabase.mockReset().mockResolvedValue(undefined);
  mocks.clearCompanionDatabase.mockReset().mockResolvedValue(undefined);
  mocks.clearAllImages.mockReset().mockResolvedValue(undefined);
  useSettingsStore.getState().setSidebarOpen(false);
});

describe('SettingsSidebar data clearing', () => {
  it('waits for image and package storage cleanup before reporting success', async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    mocks.clearAllImages.mockReturnValue(promise);
    vi.stubGlobal('confirm', vi.fn(() => true));
    useSettingsStore.getState().setSidebarOpen(true);
    render(<SettingsSidebar />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Clear All Stored Data' })); });
    expect(mocks.clearDatabase).toHaveBeenCalledOnce();
    expect(mocks.clearCompanionDatabase).toHaveBeenCalledOnce();
    expect(screen.queryByText(/All stored data cleared/)).toBeNull();
    await act(async () => { resolve(); await promise; });
    expect(await screen.findByText(/All stored data cleared/)).toBeTruthy();
  });

  it('shows the blocked or storage failure reason', async () => {
    mocks.clearDatabase.mockRejectedValue(new Error('Database deletion blocked'));
    vi.stubGlobal('confirm', vi.fn(() => true));
    useSettingsStore.getState().setSidebarOpen(true);
    render(<SettingsSidebar />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Clear All Stored Data' })); });
    expect(await screen.findByText('Database deletion blocked')).toBeTruthy();
    expect(mocks.clearCompanionDatabase).not.toHaveBeenCalled();
  });
});
