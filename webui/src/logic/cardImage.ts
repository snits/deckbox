// ABOUTME: Resolves a card's image metadata to a browser-loadable src — absolute
// ABOUTME: local paths go through Vite's /@fs/ dev-server route; URLs pass through.

import type { Card } from '../model/types';

export type CardFace = 'front' | 'back';

const FACE_KEY: Record<CardFace, string> = { front: 'image', back: 'image-back' };

/** Map a metadata image value to a URL the browser can load. Absolute local
 * paths are served via Vite's /@fs/ route; http/https/data URLs and bare
 * relative values pass through unchanged (a 404 just triggers the text fallback). */
export function resolveImageSrc(value: string): string {
  if (/^(https?:|data:)/.test(value)) return value;
  if (value.startsWith('/')) return `/@fs${value}`;
  return value;
}

/** The resolved src for a card's front (`image`) or back (`image-back`), or
 * null when that key is absent or blank. */
export function cardImageSrc(card: Card, face: CardFace): string | null {
  const value = card.meta.find((m) => m.key === FACE_KEY[face])?.value.trim();
  return value ? resolveImageSrc(value) : null;
}
