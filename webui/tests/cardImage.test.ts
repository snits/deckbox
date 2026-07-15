// ABOUTME: Unit tests for cardImage — resolving metadata image values to
// ABOUTME: browser-loadable srcs (/@fs for absolute paths) and per-face lookup.
import { describe, expect, it } from 'vitest';
import { cardImageSrc, resolveImageSrc } from '../src/logic/cardImage';
import type { Card } from '../src/model/types';

function card(meta: Card['meta']): Card {
  return { cid: 'c', id: 'x', title: '', text: '', count: '1', meta, expanded: false };
}

describe('resolveImageSrc', () => {
  it('prefixes an absolute local path with /@fs', () => {
    expect(resolveImageSrc('/home/j/decks/Beach.jpg')).toBe('/@fs/home/j/decks/Beach.jpg');
  });
  it('leaves an absolute path with spaces intact for the browser to encode', () => {
    expect(resolveImageSrc('/home/j/Journey Deck/Beach.jpg')).toBe('/@fs/home/j/Journey Deck/Beach.jpg');
  });
  it('passes http/https/data URLs through unchanged', () => {
    expect(resolveImageSrc('http://x/a.png')).toBe('http://x/a.png');
    expect(resolveImageSrc('https://x/a.png')).toBe('https://x/a.png');
    expect(resolveImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
  it('passes a bare relative value through unchanged', () => {
    expect(resolveImageSrc('ancient-ruins.png')).toBe('ancient-ruins.png');
  });
  it('passes an unmatched relative value through unchanged', () => {
    expect(resolveImageSrc('missing.png', { 'other.png': 'blob:other' })).toBe('missing.png');
  });
  it('resolves a relative value through a selected manifest asset map', () => {
    expect(resolveImageSrc('./art/ancient-ruins.png', { 'art/ancient-ruins.png': 'blob:ruins' })).toBe('blob:ruins');
    expect(resolveImageSrc('../cover.png', { '../cover.png': 'blob:cover' })).toBe('blob:cover');
  });
});

describe('cardImageSrc', () => {
  it('resolves the front image key for the front face', () => {
    const c = card([{ rid: 'm', key: 'image', value: '/a/front.jpg' }]);
    expect(cardImageSrc(c, 'front')).toBe('/@fs/a/front.jpg');
  });
  it('resolves the image-back key for the back face', () => {
    const c = card([{ rid: 'm', key: 'image-back', value: '/a/back.jpg' }]);
    expect(cardImageSrc(c, 'back')).toBe('/@fs/a/back.jpg');
  });
  it('returns null when the requested face key is absent', () => {
    const c = card([{ rid: 'm', key: 'image', value: '/a/front.jpg' }]);
    expect(cardImageSrc(c, 'back')).toBeNull();
  });
  it('returns null when the value is blank', () => {
    const c = card([{ rid: 'm', key: 'image', value: '   ' }]);
    expect(cardImageSrc(c, 'front')).toBeNull();
  });
  it('uses the selected manifest asset map for a card image', () => {
    const c = card([{ rid: 'm', key: 'image', value: './art/front.jpg' }]);
    expect(cardImageSrc(c, 'front', { 'art/front.jpg': 'blob:front' })).toBe('blob:front');
  });
});
