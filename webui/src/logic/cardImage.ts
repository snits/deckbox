// ABOUTME: Resolves a card's image metadata to a browser-loadable src — selected
// ABOUTME: folder assets use transient object URLs; absolute paths use /@fs.

import { normalizeAssetPath } from './imageAssets';
import type { ImageSourceMap } from './imageAssets';
import type { Card } from '../model/types';

export type CardFace = 'front' | 'back';

const FACE_KEY: Record<CardFace, string> = { front: 'image', back: 'image-back' };

/** Map a metadata image value to a URL the browser can load. Absolute local
 * paths are served via Vite's /@fs/ route; http/https/data URLs and unmatched
 * relative values pass through unchanged (a 404 just triggers the text fallback). */
export function resolveImageSrc(value: string, imageSources?: ImageSourceMap): string {
  if (/^(https?:|data:)/.test(value)) return value;
  if (value.startsWith('/')) return `/@fs${value}`;
  return imageSources?.[normalizeAssetPath(value)] ?? value;
}

/** The resolved src for a card's front (`image`) or back (`image-back`), or
 * null when that key is absent or blank. */
export function cardImageSrc(card: Card, face: CardFace, imageSources?: ImageSourceMap): string | null {
  const value = card.meta.find((m) => m.key === FACE_KEY[face])?.value.trim();
  return value ? resolveImageSrc(value, imageSources) : null;
}
