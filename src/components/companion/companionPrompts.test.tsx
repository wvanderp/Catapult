// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { DuplicatePrompt } from './DuplicatePrompt';
import { ReconnectPrompt } from './ReconnectPrompt';

describe('companion import prompts', () => {
  afterEach(cleanup);
  it('renders a labelled duplicate dialog, focuses it, and supports Escape', () => {
    const onChoice = vi.fn();
    render(<DuplicatePrompt count={2} onChoice={onChoice} />);
    const dialog = screen.getByRole('dialog', { name: 'Duplicate photos found' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onChoice).toHaveBeenCalledWith('cancel');
  });

  it('offers reconnect, copy, and cancel actions in a labelled dialog', () => {
    const onChoice = vi.fn();
    render(<ReconnectPrompt onChoice={onChoice} />);
    screen.getByRole('dialog', { name: 'Package already imported' });
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onChoice).toHaveBeenCalledWith('reconnect');
  });
});
