// ABOUTME: Test CardArt component render behavior and load-error fallback.
// ABOUTME: Verifies that CardArt renders an img element with correct src/alt, and returns null when the image fails to load.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CardArt } from '../../src/components/CardArt';

afterEach(cleanup);

describe('CardArt', () => {
  it('renders an img with the given src and alt', () => {
    render(<CardArt src="/@fs/a/front.jpg" alt="Beach" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/@fs/a/front.jpg');
    expect(img.getAttribute('alt')).toBe('Beach');
  });

  it('renders nothing once the image fails to load', () => {
    render(<CardArt src="/@fs/a/missing.jpg" alt="Beach" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
  });
});
