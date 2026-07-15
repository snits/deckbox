import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageSources, findManifestFiles } from '../src/logic/imageAssets';

function file(name: string, path = name, type = ''): File {
  const value = new File(['bytes'], name, { type });
  Object.defineProperty(value, 'webkitRelativePath', { value: path, configurable: true });
  return value;
}

describe('findManifestFiles', () => {
  it('finds yaml and yml files case-insensitively', () => {
    const yaml = file('oracle.YAML', 'deck/oracle.YAML');
    const yml = file('extra.yml', 'deck/extra.yml');
    expect(findManifestFiles([yaml, yml, file('notes.txt', 'deck/notes.txt')])).toEqual([yaml, yml]);
  });

  it('returns no manifests when the folder has none', () => {
    expect(findManifestFiles([file('card.png', 'deck/card.png', 'image/png')])).toEqual([]);
  });
});

describe('createImageSources', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn((asset: File) => `blob:${asset.name}`) });
  });

  it('maps image files relative to the manifest directory and skips non-images', () => {
    const manifest = file('oracle.yaml', 'deck/manifests/oracle.yaml');
    const front = file('front.png', 'deck/manifests/front.png', 'image/png');
    const nested = file('back.JPG', 'deck/manifests/art/back.JPG');
    const parent = file('cover.webp', 'deck/cover.webp');
    const notes = file('notes.txt', 'deck/manifests/notes.txt', 'text/plain');

    expect(createImageSources(manifest, [manifest, front, nested, parent, notes])).toEqual({
      'front.png': 'blob:front.png',
      'art/back.JPG': 'blob:back.JPG',
      '../cover.webp': 'blob:cover.webp',
    });
    expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(URL.createObjectURL).mock.calls.map(([asset]) => (asset as File).name)).toEqual([
      'front.png',
      'back.JPG',
      'cover.webp',
    ]);
  });

  it('recognizes common image extensions when MIME type is missing', () => {
    const manifest = file('oracle.yml', 'deck/oracle.yml');
    const image = file('card.svg', 'deck/card.svg');
    const notImage = file('card.bin', 'deck/card.bin');

    expect(createImageSources(manifest, [manifest, image, notImage])).toEqual({ 'card.svg': 'blob:card.svg' });
  });

  it('normalizes dot segments and backslash separators', () => {
    const manifest = file('oracle.yaml', 'deck\\manifests\\oracle.yaml');
    const image = file('card.png', 'deck\\manifests\\art\\..\\./card.png', 'image/png');

    expect(createImageSources(manifest, [manifest, image])).toEqual({ 'card.png': 'blob:card.png' });
  });

  it('falls back to file.name when webkitRelativePath is absent', () => {
    const manifest = file('oracle.yaml');
    const image = new File(['bytes'], 'card.png', { type: 'image/png' });

    expect(createImageSources(manifest, [manifest, image])).toEqual({ 'card.png': 'blob:card.png' });
  });

  it('does not create a URL for the manifest itself', () => {
    const manifest = file('oracle.yaml', 'deck/oracle.yaml', 'image/png');
    const createObjectURL = vi.mocked(URL.createObjectURL);

    createImageSources(manifest, [manifest]);

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('keeps the first selected file when two files normalize to one asset path', () => {
    const manifest = file('oracle.yaml', 'deck/oracle.yaml');
    const first = file('card.png', 'deck/card.png', 'image/png');
    const duplicate = file('card.png', 'deck/./card.png', 'image/png');

    expect(createImageSources(manifest, [manifest, first, duplicate])).toEqual({ 'card.png': 'blob:card.png' });
    expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledTimes(1);
  });
});
