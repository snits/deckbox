// ABOUTME: Tests for the .yaml import flow — the pure `importYaml` mapper
// ABOUTME: (engine result -> ImportOutcome/notice text) and Cabinet's wiring
// ABOUTME: of file-pick/drag-drop through it, including failure/notice banners.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Engine, ParseResult } from '../../src/engine/engine';
import { EngineProvider } from '../../src/engine/useEngine';
import { importYaml } from '../../src/import/importDeck';
import { Cabinet } from '../../src/components/Cabinet';
import { seedDeck } from '../../src/model/seed';
import { useWorkspace } from '../../src/model/store';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  localStorage.clear();
});

function fakeEngine(parseDeck: (yaml: string) => ParseResult): Engine {
  return {
    parseDeck,
    validateDeck: () => ({ valid: true }),
    newSession: () => ({ name: 'webui', definition_path: '-', containers: {}, definition_cards: [] }),
    draw: () => ({
      session: { name: 'webui', definition_path: '-', containers: {}, definition_cards: [] },
      drawn: [],
    }),
    peek: () => [],
    shuffle: () => ({ name: 'webui', definition_path: '-', containers: {}, definition_cards: [] }),
  };
}

const OK_DECK: ParseResult = {
  ok: true,
  deck: { name: 'Crossroads Oracle', description: null, containers: null, cards: [{ id: 'a', title: null, text: 'A', count: null, metadata: null }] },
  sawComments: false,
  droppedKeys: [],
};

const FOLDER_OK_DECK: ParseResult = {
  ...OK_DECK,
  deck: {
    ...OK_DECK.deck,
    cards: [{ id: 'a', title: null, text: 'A', count: null, metadata: { image: 'art/card.png' } }],
  },
};

describe('importYaml', () => {
  it('returns the failure banner text when parseDeck fails', () => {
    const engine = fakeEngine(() => ({ ok: false, error: 'line 3: missing name' }));

    const outcome = importYaml(engine, 'bad.yaml', 'not: valid');

    expect(outcome).toEqual({ ok: false, error: 'Couldn’t import bad.yaml: line 3: missing name' });
  });

  it('returns a null notice when nothing was dropped or commented out', () => {
    const engine = fakeEngine(() => OK_DECK);

    const outcome = importYaml(engine, 'oracle.yaml', 'name: X');

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.deck.name).toBe('Crossroads Oracle');
      expect(outcome.notice).toBeNull();
    }
  });

  it('notes comments when sawComments is true', () => {
    const engine = fakeEngine(() => ({ ...OK_DECK, sawComments: true }));

    const outcome = importYaml(engine, 'x.yaml', 'name: X');

    expect(outcome).toMatchObject({
      ok: true,
      notice: 'Imported “Crossroads Oracle” — comments in the source file won’t be kept.',
    });
  });

  it('notes dropped keys when present', () => {
    const engine = fakeEngine(() => ({ ...OK_DECK, droppedKeys: ['foo', 'bar'] }));

    const outcome = importYaml(engine, 'x.yaml', 'name: X');

    expect(outcome).toMatchObject({
      ok: true,
      notice: 'Imported “Crossroads Oracle” — unrecognized keys dropped: foo, bar.',
    });
  });

  it('joins both notes with "; " when both apply', () => {
    const engine = fakeEngine(() => ({ ...OK_DECK, sawComments: true, droppedKeys: ['foo'] }));

    const outcome = importYaml(engine, 'x.yaml', 'name: X');

    expect(outcome).toMatchObject({
      ok: true,
      notice:
        'Imported “Crossroads Oracle” — comments in the source file won’t be kept; unrecognized keys dropped: foo.',
    });
  });
});

function resetToSeed() {
  const seed = seedDeck();
  useWorkspace.setState({ decks: [seed], selUid: seed.uid, editRevision: 0, imageSources: {} });
}

function renderCabinet(engine: Engine) {
  render(
    <EngineProvider engine={engine}>
      <Cabinet />
    </EngineProvider>,
  );
}

function chooseFile(file: File) {
  const input = screen.getByTestId('cabinet-import-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function chooseFolder(files: File[]) {
  const input = screen.getByTestId('cabinet-folder-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

function folderFile(contents: string, name: string, relativePath: string, type = ''): File {
  const file = new File([contents], name, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, configurable: true });
  return file;
}

function dropFile(file: File) {
  const rail = screen.getByText('THE CABINET').closest('.pane-cabinet') as HTMLElement;
  fireEvent.drop(rail, { dataTransfer: { files: [file] } });
}

describe('Cabinet import wiring', () => {
  beforeEach(resetToSeed);

  it('imports examples/oracle.yaml content: adds and selects the deck, no banner', async () => {
    const parseDeck = vi.fn(() => OK_DECK);
    renderCabinet(fakeEngine(parseDeck));
    const source = 'name: "Crossroads Oracle"\ncards:\n  - id: a\n    text: A\n';
    const file = new File([source], 'oracle.yaml', { type: 'application/x-yaml' });

    chooseFile(file);

    await waitFor(() => expect(useWorkspace.getState().decks).toHaveLength(2));
    expect(parseDeck).toHaveBeenCalledWith(source);
    const added = useWorkspace.getState().decks[1];
    expect(added.name).toBe('Crossroads Oracle');
    expect(useWorkspace.getState().selUid).toBe(added.uid);
    expect(screen.queryByTestId('import-error-banner')).toBeNull();
    expect(screen.queryByTestId('import-notice-banner')).toBeNull();
  });

  it('shows the comments notice for a comment-bearing valid deck', async () => {
    renderCabinet(fakeEngine(() => ({ ...OK_DECK, sawComments: true })));
    const file = new File(['name: X\n# a comment\ncards: []'], 'commented.yaml');

    chooseFile(file);

    await waitFor(() => expect(screen.getByTestId('import-notice-banner')).toBeTruthy());
    expect(screen.getByTestId('import-notice-banner').textContent).toContain(
      'Imported “Crossroads Oracle” — comments in the source file won’t be kept.',
    );
  });

  it('shows the dropped-keys notice for an unknown-key deck', async () => {
    renderCabinet(fakeEngine(() => ({ ...OK_DECK, droppedKeys: ['weight', 'rarity'] })));
    const file = new File(['name: X\nweight: 3\ncards: []'], 'unknown-key.yaml');

    chooseFile(file);

    await waitFor(() => expect(screen.getByTestId('import-notice-banner')).toBeTruthy());
    expect(screen.getByTestId('import-notice-banner').textContent).toContain(
      'unrecognized keys dropped: weight, rarity.',
    );
  });

  it('shows the failure banner for malformed YAML and leaves the workspace unchanged', async () => {
    renderCabinet(fakeEngine(() => ({ ok: false, error: 'line 2: not key: value' })));
    const before = useWorkspace.getState();
    const file = new File(['not valid yaml {{'], 'malformed.yaml');

    chooseFile(file);

    await waitFor(() => expect(screen.getByTestId('import-error-banner')).toBeTruthy());
    expect(screen.getByTestId('import-error-banner').textContent).toContain(
      'Couldn’t import malformed.yaml: line 2: not key: value',
    );
    expect(useWorkspace.getState().decks).toEqual(before.decks);
    expect(useWorkspace.getState().selUid).toBe(before.selUid);
  });

  it('dismisses the error banner on click', async () => {
    renderCabinet(fakeEngine(() => ({ ok: false, error: 'bad' })));
    chooseFile(new File(['x'], 'bad.yaml'));
    await waitFor(() => expect(screen.getByTestId('import-error-banner')).toBeTruthy());

    fireEvent.click(screen.getByTestId('import-error-banner').querySelector('button')!);

    expect(screen.queryByTestId('import-error-banner')).toBeNull();
  });

  it('dismisses the notice banner on click', async () => {
    renderCabinet(fakeEngine(() => ({ ...OK_DECK, sawComments: true })));
    chooseFile(new File(['x'], 'x.yaml'));
    await waitFor(() => expect(screen.getByTestId('import-notice-banner')).toBeTruthy());

    fireEvent.click(screen.getByTestId('import-notice-banner').querySelector('button')!);

    expect(screen.queryByTestId('import-notice-banner')).toBeNull();
  });

  it('also imports on drag-drop onto the rail', async () => {
    renderCabinet(fakeEngine(() => OK_DECK));

    dropFile(new File(['name: X\ncards: []'], 'dropped.yaml'));

    await waitFor(() => expect(useWorkspace.getState().decks).toHaveLength(2));
  });

  it('imports one manifest from a folder and maps a sibling image relative to it', async () => {
    renderCabinet(fakeEngine(() => FOLDER_OK_DECK));
    const manifest = folderFile('name: X', 'oracle.yaml', 'oracle/oracle.yaml', 'application/x-yaml');
    const image = folderFile('image bytes', 'card.png', 'oracle/art/card.png', 'image/png');
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:card') });

    chooseFolder([manifest, image]);

    await waitFor(() => expect(useWorkspace.getState().decks).toHaveLength(2));
    const imported = useWorkspace.getState().decks[1];
    expect(useWorkspace.getState().imageSources[imported.uid]).toEqual({ 'art/card.png': 'blob:card' });
  });

  it('rejects a folder without exactly one manifest and leaves the workspace unchanged', async () => {
    renderCabinet(fakeEngine(() => FOLDER_OK_DECK));
    const before = useWorkspace.getState();
    const image = folderFile('image bytes', 'card.png', 'oracle/card.png', 'image/png');

    chooseFolder([image]);

    expect(screen.getByTestId('import-error-banner').textContent).toContain(
      'Couldn’t import folder: expected exactly one .yaml or .yml manifest',
    );
    expect(useWorkspace.getState().decks).toEqual(before.decks);
    expect(useWorkspace.getState().selUid).toBe(before.selUid);
  });

  it('rejects a folder with multiple manifests and leaves the workspace unchanged', () => {
    renderCabinet(fakeEngine(() => FOLDER_OK_DECK));
    const before = useWorkspace.getState();
    const first = folderFile('name: X', 'one.yaml', 'oracle/one.yaml', 'application/x-yaml');
    const second = folderFile('name: X', 'two.yml', 'oracle/two.yml', 'application/x-yaml');

    chooseFolder([first, second]);

    expect(screen.getByTestId('import-error-banner').textContent).toContain(
      'Couldn’t import folder: expected exactly one .yaml or .yml manifest',
    );
    expect(useWorkspace.getState().decks).toEqual(before.decks);
    expect(useWorkspace.getState().selUid).toBe(before.selUid);
  });

  it('shows the failure banner when the file cannot be read, and leaves the workspace unchanged', async () => {
    const parseDeck = vi.fn(() => OK_DECK);
    renderCabinet(fakeEngine(parseDeck));
    const before = useWorkspace.getState();
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'error', {
        value: new DOMException('permission denied'),
        configurable: true,
      });
      this.onerror?.(new ProgressEvent('error') as unknown as ProgressEvent<FileReader>);
    });

    chooseFile(new File(['x'], 'unreadable.yaml'));

    await waitFor(() => expect(screen.getByTestId('import-error-banner')).toBeTruthy());
    expect(screen.getByTestId('import-error-banner').textContent).toContain(
      'Couldn’t import unreadable.yaml: permission denied',
    );
    expect(parseDeck).not.toHaveBeenCalled();
    expect(useWorkspace.getState().decks).toEqual(before.decks);
    expect(useWorkspace.getState().selUid).toBe(before.selUid);
  });

  it('falls back to a generic reason when the read error has no message', async () => {
    renderCabinet(fakeEngine(() => OK_DECK));
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'error', { value: null, configurable: true });
      this.onerror?.(new ProgressEvent('error') as unknown as ProgressEvent<FileReader>);
    });

    chooseFile(new File(['x'], 'unreadable.yaml'));

    await waitFor(() => expect(screen.getByTestId('import-error-banner')).toBeTruthy());
    expect(screen.getByTestId('import-error-banner').textContent).toContain(
      'Couldn’t import unreadable.yaml: file could not be read',
    );
  });
});
