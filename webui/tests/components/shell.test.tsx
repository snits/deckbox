// ABOUTME: Tests for the app shell — Header, Cabinet, EmptyState — wired to
// ABOUTME: the workspace store: first-run empty state, selection, validity
// ABOUTME: pill, delete-with-confirm, and the seed deck's unique/total badge.

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppContent } from '../../src/App';
import { Cabinet } from '../../src/components/Cabinet';
import type { Engine } from '../../src/engine/engine';
import { EngineProvider } from '../../src/engine/useEngine';
import { seedDeck } from '../../src/model/seed';
import { useWorkspace } from '../../src/model/store';

// AppContent mounts RightPane, which renders TestDraw (and so calls
// useEngine) whenever a deck is selected — a no-op fake is enough here since
// these tests don't exercise draw/peek/shuffle.
function fakeEngine(): Engine {
  return {
    parseDeck: () => ({ ok: false, error: 'not used' }),
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

function resetToSeed() {
  const seed = seedDeck();
  useWorkspace.setState({ decks: [seed], selUid: seed.uid, editRevision: 0, fileHandles: {} });
}

function resetToEmpty() {
  useWorkspace.setState({ decks: [], selUid: null, editRevision: 0, fileHandles: {} });
}

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetToSeed();
});

describe('first-run empty workspace', () => {
  beforeEach(resetToEmpty);

  it('renders "The cabinet is empty" with a create/import prompt', () => {
    render(<AppContent />);

    expect(screen.getByText('The cabinet is empty')).toBeTruthy();
    expect(
      screen.getByText('Create a new deck or import an existing .yaml definition to begin.'),
    ).toBeTruthy();
    expect(screen.getByText('+ new deck')).toBeTruthy();
    expect(screen.getByText('⤴ import .yaml')).toBeTruthy();
  });

  it('shows no header deck name or status pill', () => {
    render(<AppContent />);

    expect(screen.queryByTestId('header-deck-name')).toBeNull();
    expect(screen.queryByTestId('header-status')).toBeNull();
  });
});

describe('deck with existing decks but none selected', () => {
  it('renders "Nothing selected"', () => {
    useWorkspace.getState().select(null);
    render(<AppContent />);

    expect(screen.getByText('Nothing selected')).toBeTruthy();
    expect(screen.getByText('Choose a deck from the cabinet to edit it.')).toBeTruthy();
  });
});

describe('adding a deck', () => {
  beforeEach(resetToEmpty);

  it('selects it and the header reflects its name and validity', () => {
    render(
      <EngineProvider engine={fakeEngine()}>
        <AppContent />
      </EngineProvider>,
    );

    fireEvent.click(screen.getByText('+ new deck'));

    expect(screen.getByTestId('header-deck-name').textContent).toBe('New Deck');
    // A freshly-created deck has one blank card — empty id and text are
    // editor-check problems until the user fills them in (Task 8).
    expect(screen.getByTestId('header-status').textContent).toContain('2 problems');

    act(() => {
      const selUid = useWorkspace.getState().selUid!;
      useWorkspace.getState().updateDeck(selUid, (d) => {
        d.cards[0].id = 'first-card';
        d.cards[0].text = 'Something happens.';
      });
    });

    expect(screen.getByTestId('header-status').textContent).toBe('Deck is valid');
  });
});

describe('existing valid deck selected', () => {
  it('shows its name and "Deck is valid"', () => {
    render(
      <EngineProvider engine={fakeEngine()}>
        <AppContent />
      </EngineProvider>,
    );

    expect(screen.getByTestId('header-deck-name').textContent).toBe('Fate Oracle');
    expect(screen.getByTestId('header-status').textContent).toBe('Deck is valid');
  });
});

describe('cabinet unique/total badge', () => {
  it('shows 4/7 for the seed deck', () => {
    render(<Cabinet />);

    expect(screen.getByText('4/7')).toBeTruthy();
  });
});

describe('deck deletion', () => {
  beforeEach(() => {
    useWorkspace.getState().addDeck();
  });

  it('asks for confirmation with the deck name, and removes + selects next on confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const [seed] = useWorkspace.getState().decks;
    render(<Cabinet />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete New Deck' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Remove “New Deck” from the cabinet? This only clears it from Deck Forge — it never deletes a saved .yaml from your disk.',
    );
    const state = useWorkspace.getState();
    expect(state.decks.map((d) => d.uid)).toEqual([seed.uid]);
    expect(state.selUid).toBe(seed.uid);
  });

  it('does nothing when the confirm dialog is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Cabinet />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete New Deck' }));

    expect(useWorkspace.getState().decks).toHaveLength(2);
  });

  it('names the saved file in the confirm when the deck is bound to one', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const uid = useWorkspace.getState().selUid as string;
    act(() => {
      useWorkspace
        .getState()
        .bindFile(uid, { name: 'oracle.yaml' } as unknown as FileSystemFileHandle);
    });
    render(<Cabinet />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete New Deck' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Remove “New Deck” from the cabinet? This only clears it from Deck Forge — it never deletes a saved .yaml from your disk. (saved as “oracle.yaml”)',
    );
  });
});

describe('cabinet selection', () => {
  it('selects a deck row on click', () => {
    useWorkspace.getState().addDeck();
    const [seed] = useWorkspace.getState().decks;
    useWorkspace.getState().select(seed.uid);
    render(<Cabinet />);

    fireEvent.click(screen.getByText('New Deck'));

    expect(useWorkspace.getState().selUid).not.toBe(seed.uid);
  });
});

describe('import wiring', () => {
  it('calls onImportFile with the chosen file', () => {
    const onImportFile = vi.fn();
    render(<Cabinet onImportFile={onImportFile} />);
    const file = new File(['name: X\ncards:\n  - id: a\n    text: t\n'], 'deck.yaml', {
      type: 'application/x-yaml',
    });
    const input = screen.getByTestId('cabinet-import-input') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(onImportFile).toHaveBeenCalledWith(file);
  });

  it('does nothing when no handler is wired', () => {
    render(<Cabinet />);
    const file = new File(['name: X\ncards:\n  - id: a\n    text: t\n'], 'deck.yaml');
    const input = screen.getByTestId('cabinet-import-input') as HTMLInputElement;

    expect(() => fireEvent.change(input, { target: { files: [file] } })).not.toThrow();
  });
});
