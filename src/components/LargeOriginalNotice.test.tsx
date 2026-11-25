// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LargeOriginalNotice } from './LargeOriginalNotice';

afterEach(cleanup);

describe('LargeOriginalNotice', () => {
  it('lists affected images and explains that Commons may reject large single uploads', () => {
    render(<LargeOriginalNotice names={['large.jpg', 'bundle photo.tif']} />);
    expect(screen.getByText('Wikimedia Commons may reject single uploads above 100 MB.')).toBeTruthy();
    expect(screen.getByText('Large originals: large.jpg, bundle photo.tif')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Details and updates' }).getAttribute('href')).toBe('https://github.com/wvanderp/Catapult/issues/2');
  });

  it('renders no banner when no originals exceed the threshold', () => {
    const { container } = render(<LargeOriginalNotice names={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
