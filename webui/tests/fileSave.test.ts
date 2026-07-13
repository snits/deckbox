// ABOUTME: Unit tests for the File System Access wrapper — capability probe,
// ABOUTME: pick-and-write, user-cancel, and permission-gated re-write.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { canPickFiles, pickAndWrite, writeExisting } from '../src/logic/fileSave';

afterEach(() => vi.unstubAllGlobals());

function fakeHandle(permission: PermissionState = 'granted') {
  const written: string[] = [];
  const writable = {
    write: vi.fn(async (t: string) => {
      written.push(t);
    }),
    close: vi.fn(async () => {}),
  };
  return {
    name: 'deck.yaml',
    written,
    writable,
    createWritable: vi.fn(async () => writable),
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
  };
}

describe('canPickFiles', () => {
  it('is false when showSaveFilePicker is absent (jsdom default)', () => {
    expect(canPickFiles()).toBe(false);
  });

  it('is true when showSaveFilePicker is present', () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn());
    expect(canPickFiles()).toBe(true);
  });
});

describe('pickAndWrite', () => {
  it('writes the text to the picked file and returns the handle', async () => {
    const handle = fakeHandle();
    vi.stubGlobal('showSaveFilePicker', vi.fn(async () => handle));

    const result = await pickAndWrite('deck.yaml', 'name: Deck\n');

    expect(result).toBe(handle);
    expect(handle.writable.write).toHaveBeenCalledWith('name: Deck\n');
    expect(handle.writable.close).toHaveBeenCalledTimes(1);
  });

  it('returns null when the user dismisses the picker', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      }),
    );

    expect(await pickAndWrite('deck.yaml', 'x')).toBeNull();
  });
});

describe('writeExisting', () => {
  it('writes and returns true when permission is already granted', async () => {
    const handle = fakeHandle('granted');

    expect(await writeExisting(handle as unknown as FileSystemFileHandle, 'y: 1\n')).toBe(true);
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(handle.writable.write).toHaveBeenCalledWith('y: 1\n');
  });

  it('returns false without writing when permission is denied', async () => {
    const handle = fakeHandle('denied');

    expect(await writeExisting(handle as unknown as FileSystemFileHandle, 'y: 1\n')).toBe(false);
    expect(handle.writable.write).not.toHaveBeenCalled();
  });
});
