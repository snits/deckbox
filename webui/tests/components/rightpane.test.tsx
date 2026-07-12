// ABOUTME: Tests for the right pane — live YAML viewer with copy/download,
// ABOUTME: the validation list, and the test-draw panel (draw/peek/shuffle/
// ABOUTME: reset against a fake Engine that mirrors the real draw/peek
// ABOUTME: contract: pile-ascending arrays, top-of-deck last).

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Engine, SessionState } from '../../src/engine/engine';
import { EngineProvider } from '../../src/engine/useEngine';
import { RightPane } from '../../src/components/RightPane';
import { emitDeck } from '../../src/logic/emit';
import { seedDeck } from '../../src/model/seed';
import { useWorkspace } from '../../src/model/store';
import type { Deck } from '../../src/model/types';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

// Mirrors deckbox-core semantics faithfully enough to exercise the
// component's reversal logic: draw_pile built in definition order, draw/peek
// take the tail of the pile via splice (pile-ascending order preserved, so
// top-of-deck is the LAST element of both the pile and the returned chunk).
function buildSessionState(deck: Deck): SessionState {
  const pile: string[] = [];
  deck.cards.forEach((c) => {
    const n = Math.max(1, parseInt(c.count, 10) || 1);
    for (let i = 1; i <= n; i++) pile.push(`${c.id}:${i}`);
  });
  const containers: Record<string, string[]> = { draw_pile: pile };
  deck.containers.forEach((ct) => {
    const name = ct.trim();
    if (name && name !== 'draw_pile') containers[name] = [];
  });
  return { name: 'webui', definition_path: '-', containers, definition_cards: deck.cards.map((c) => c.id) };
}

function makeFakeEngine(deck: Deck): Engine {
  return {
    parseDeck: () => ({ ok: false, error: 'not used' }),
    validateDeck: () => ({ valid: true }),
    newSession: () => buildSessionState(deck),
    draw: (session, count) => {
      const pile = session.containers.draw_pile.slice();
      const chunk = pile.splice(pile.length - count, count);
      const drawn = (session.containers.drawn ?? []).concat(chunk);
      return {
        session: { ...session, containers: { ...session.containers, draw_pile: pile, drawn } },
        drawn: chunk,
      };
    },
    peek: (session, count) => {
      const pile = session.containers.draw_pile;
      return pile.slice(pile.length - count);
    },
    shuffle: (session, seed) => {
      const pile = session.containers.draw_pile.slice().reverse();
      void seed;
      return { ...session, containers: { ...session.containers, draw_pile: pile } };
    },
  };
}

function renderRightPane(deck: Deck) {
  useWorkspace.setState({ decks: [deck], selUid: deck.uid, editRevision: 0 });
  const engine = makeFakeEngine(deck);
  render(
    <EngineProvider engine={engine}>
      <RightPane />
    </EngineProvider>,
  );
  return engine;
}

function drawNInput(): HTMLInputElement {
  return screen.getByRole('spinbutton') as HTMLInputElement;
}

function chip(name: string): HTMLElement {
  return screen.getByTestId(`pile-chip-${name}`);
}

describe('YAML pane', () => {
  it('shows the emitted YAML for the selected deck, titled <slug>.YAML', () => {
    const deck = seedDeck();
    renderRightPane(deck);

    expect(screen.getByText('fate-oracle.YAML')).toBeTruthy();
    expect(screen.getByTestId('yaml-box').textContent).toBe(emitDeck(deck));
  });

  it('reflects an edit immediately', () => {
    const deck = seedDeck();
    renderRightPane(deck);

    act(() => {
      useWorkspace.getState().updateDeck(deck.uid, (d) => {
        d.name = 'Renamed Deck';
      });
    });

    const updated = useWorkspace.getState().decks[0];
    expect(screen.getByTestId('yaml-box').textContent).toBe(emitDeck(updated));
    expect(screen.getByText('renamed-deck.YAML')).toBeTruthy();
  });

  it('copies the YAML to the clipboard and animates the label back after 1.4s', () => {
    vi.useFakeTimers();
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const deck = seedDeck();
    renderRightPane(deck);

    fireEvent.click(screen.getByText('⧉ copy'));

    expect(writeText).toHaveBeenCalledWith(emitDeck(deck));
    expect(screen.getByText('✓ copied')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByText('⧉ copy')).toBeTruthy();
    vi.useRealTimers();
  });

  it('downloads <slug>.yaml', () => {
    const createObjectURL = vi.fn((_obj: Blob) => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const deck = seedDeck();
    renderRightPane(deck);

    fireEvent.click(screen.getByText('⬇ .yaml'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('fate-oracle.yaml');
  });
});

describe('VALIDATION', () => {
  it('shows "Deck is valid." for a valid deck', () => {
    renderRightPane(seedDeck());

    const list = screen.getByTestId('validation-list');
    expect(list.textContent).toBe('✓ Deck is valid.');
  });

  it('mirrors validateDeckModel problems for an invalid deck', () => {
    const deck = seedDeck();
    renderRightPane(deck);

    act(() => {
      useWorkspace.getState().updateDeck(deck.uid, (d) => {
        d.cards[0].text = '';
      });
    });

    const list = screen.getByTestId('validation-list');
    expect(list.textContent).toContain("card 'goblin-ambush' has empty text (editor check)");
  });
});

describe('DRAW THE CARDS', () => {
  it('shows draw_pile at 7 and no drawn chip before any draw', () => {
    renderRightPane(seedDeck());

    expect(chip('draw_pile').textContent).toBe('draw_pile 7');
    expect(chip('discard').textContent).toBe('discard 0');
    expect(screen.queryByTestId('pile-chip-drawn')).toBeNull();
    expect(screen.getByText('— draw from the pile to reveal cards —')).toBeTruthy();
  });

  it('draws N=3: depletes draw_pile 7→4, accumulates 3 rows top-of-deck-first', () => {
    renderRightPane(seedDeck());

    fireEvent.change(drawNInput(), { target: { value: '3' } });
    fireEvent.click(screen.getByText('⤴ Draw'));

    expect(chip('draw_pile').textContent).toBe('draw_pile 4');
    expect(chip('drawn').textContent).toBe('drawn 3');

    const rows = screen.getAllByTestId('output-row');
    expect(rows).toHaveLength(3);
    // Pile built in definition order: goblin-ambush:1..3, dragon-sighting:1,
    // ancient-ruins:1, sudden-storm:1..2. Drawing 3 takes the tail
    // (sudden-storm:1, sudden-storm:2, ancient-ruins:1 in pile order — top
    // of deck is the pile's last element) and displays top-of-deck first.
    expect(rows[0].textContent).toContain('Sudden Storm');
    expect(rows[0].textContent).toContain('sudden-storm:2');
    expect(rows[1].textContent).toContain('Sudden Storm');
    expect(rows[1].textContent).toContain('sudden-storm:1');
    expect(rows[2].textContent).toContain('Ancient Ruins');
    expect(rows[2].textContent).toContain('ancient-ruins:1');
  });

  it('draw with N=99 clamps to the remaining pile, empties it, disables Draw, and shows the hint', () => {
    renderRightPane(seedDeck());

    fireEvent.change(drawNInput(), { target: { value: '99' } });
    fireEvent.click(screen.getByText('⤴ Draw'));

    expect(chip('draw_pile').textContent).toBe('draw_pile 0');
    expect(chip('drawn').textContent).toBe('drawn 7');
    expect(screen.getAllByTestId('output-row')).toHaveLength(7);
    expect((screen.getByText('⤴ Draw') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('pile empty — reset to draw again')).toBeTruthy();
  });

  it('peek shows a violet "peek —" title, top-of-deck-first, and moves nothing', () => {
    renderRightPane(seedDeck());

    fireEvent.change(drawNInput(), { target: { value: '2' } });
    fireEvent.click(screen.getByText('◉ Peek'));

    expect(chip('draw_pile').textContent).toBe('draw_pile 7');
    expect(screen.queryByTestId('pile-chip-drawn')).toBeNull();

    const rows = screen.getAllByTestId('output-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('peek — Sudden Storm');
    expect(rows[0].textContent).toContain('sudden-storm:2');
    expect(rows[1].textContent).toContain('peek — Sudden Storm');
    expect(rows[1].textContent).toContain('sudden-storm:1');
  });

  it('Reset restores chips to the pre-draw state and clears output', () => {
    renderRightPane(seedDeck());

    fireEvent.change(drawNInput(), { target: { value: '3' } });
    fireEvent.click(screen.getByText('⤴ Draw'));
    fireEvent.click(screen.getByText('↺ Reset'));

    expect(chip('draw_pile').textContent).toBe('draw_pile 7');
    expect(screen.queryByTestId('pile-chip-drawn')).toBeNull();
    expect(screen.getByText('— draw from the pile to reveal cards —')).toBeTruthy();
    expect((screen.getByText('⤴ Draw') as HTMLButtonElement).disabled).toBe(false);
  });

  it('editing the deck mid-session resets the session and output', () => {
    const deck = seedDeck();
    renderRightPane(deck);

    fireEvent.change(drawNInput(), { target: { value: '3' } });
    fireEvent.click(screen.getByText('⤴ Draw'));
    expect(chip('draw_pile').textContent).toBe('draw_pile 4');

    act(() => {
      useWorkspace.getState().updateDeck(deck.uid, (d) => {
        d.name = 'Renamed Mid-Session';
      });
    });

    expect(chip('draw_pile').textContent).toBe('draw_pile 7');
    expect(screen.queryByTestId('pile-chip-drawn')).toBeNull();
    expect(screen.getByText('— draw from the pile to reveal cards —')).toBeTruthy();
  });
});

describe('no-deck state', () => {
  it('shows the placeholder YAML, hides copy/download, and replaces validation/test-draw with a placeholder', () => {
    useWorkspace.setState({ decks: [], selUid: null, editRevision: 0 });
    render(
      <EngineProvider engine={makeFakeEngine(seedDeck())}>
        <RightPane />
      </EngineProvider>,
    );

    expect(screen.getByTestId('yaml-box').textContent).toBe('# no deck selected');
    expect(screen.queryByText('⧉ copy')).toBeNull();
    expect(screen.queryByText('⬇ .yaml')).toBeNull();
    expect(screen.queryByTestId('validation-list')).toBeNull();
    expect(screen.queryByText('DRAW THE CARDS')).toBeNull();
    expect(screen.getByText('— select a deck to validate and test-draw —')).toBeTruthy();
  });
});
