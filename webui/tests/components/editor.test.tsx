// ABOUTME: Tests for the center-pane deck editor — deck fields, CONTAINERS
// ABOUTME: rows, and the filterable, reorderable, collapsible CARDS list —
// ABOUTME: wired to the workspace store and validateDeckModel.

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DeckEditor } from '../../src/components/DeckEditor';
import { Header } from '../../src/components/Header';
import { seedDeck } from '../../src/model/seed';
import { useWorkspace } from '../../src/model/store';

function resetToSeed() {
  const seed = seedDeck();
  useWorkspace.setState({ decks: [seed], selUid: seed.uid, editRevision: 0 });
  return seed;
}

function currentDeck() {
  const state = useWorkspace.getState();
  return state.decks.find((d) => d.uid === state.selUid)!;
}

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetToSeed();
});

describe('deck name and description', () => {
  it('shows current values and edits update the store', () => {
    render(<DeckEditor />);

    const nameInput = screen.getByPlaceholderText('Fate Oracle') as HTMLInputElement;
    expect(nameInput.value).toBe('Fate Oracle');
    fireEvent.change(nameInput, { target: { value: 'Renamed Deck' } });
    expect(currentDeck().name).toBe('Renamed Deck');

    const descInput = screen.getByPlaceholderText(
      'Draw to reveal what fate has in store',
    ) as HTMLInputElement;
    expect(descInput.value).toBe('Draw to reveal what fate has in store');
    fireEvent.change(descInput, { target: { value: 'New flavor text' } });
    expect(currentDeck().description).toBe('New flavor text');
  });
});

describe('CONTAINERS section', () => {
  it('shows the seed container, adds a row, edits it, and removes it', () => {
    render(<DeckEditor />);

    expect(screen.getByDisplayValue('discard')).toBeTruthy();

    fireEvent.click(screen.getByText('+ add'));
    expect(currentDeck().containers).toEqual(['discard', '']);

    const rows = screen.getAllByTestId(/container-row-/);
    expect(rows).toHaveLength(2);

    const newRowInput = within(rows[1]).getByPlaceholderText('discard');
    fireEvent.change(newRowInput, { target: { value: 'sideboard' } });
    expect(currentDeck().containers).toEqual(['discard', 'sideboard']);

    fireEvent.click(within(rows[0]).getByText('✕'));
    expect(currentDeck().containers).toEqual(['sideboard']);
  });

  it('shows the error state on a row named draw_pile', () => {
    render(<DeckEditor />);

    const row = screen.getByTestId('container-row-0');
    const input = within(row).getByDisplayValue('discard') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'draw_pile' } });

    expect(input.className).toContain('field-input--bad');
  });
});

describe('CARDS section header', () => {
  it('shows unique/total instance counts', () => {
    render(<DeckEditor />);

    expect(screen.getByText('4 unique · 7 total instances')).toBeTruthy();
  });

  it('adds a blank, expanded card via + card', () => {
    render(<DeckEditor />);

    fireEvent.click(screen.getByText('+ card'));

    expect(currentDeck().cards).toHaveLength(5);
    const added = currentDeck().cards[4];
    expect(added.id).toBe('');
    expect(added.expanded).toBe(true);
    expect(screen.getByText('5 unique · 8 total instances')).toBeTruthy();
  });
});

describe('CARDS filter', () => {
  it('narrows by id substring', () => {
    render(<DeckEditor />);

    fireEvent.change(screen.getByPlaceholderText('filter…'), { target: { value: 'goblin' } });

    expect(screen.getByTestId(/card-row-c1/)).toBeTruthy();
    expect(screen.queryByTestId(/card-row-c2/)).toBeNull();
    expect(screen.queryByTestId(/card-row-c3/)).toBeNull();
    expect(screen.queryByTestId(/card-row-c4/)).toBeNull();
  });

  it('narrows by a word from card text', () => {
    render(<DeckEditor />);

    // "dragon-sighting" card's text is "A shadow passes overhead…"
    fireEvent.change(screen.getByPlaceholderText('filter…'), { target: { value: 'shadow' } });

    expect(screen.getByTestId('card-row-c2')).toBeTruthy();
    expect(screen.queryByTestId('card-row-c1')).toBeNull();
  });

  it('is case-insensitive', () => {
    render(<DeckEditor />);

    fireEvent.change(screen.getByPlaceholderText('filter…'), { target: { value: 'GOBLIN' } });

    expect(screen.getByTestId('card-row-c1')).toBeTruthy();
  });
});

describe('collapsed card row', () => {
  it('shows the id chip, preview, and no copies pill when count is 1', () => {
    render(<DeckEditor />);

    const row = screen.getByTestId('card-row-c2'); // dragon-sighting, count 1
    expect(within(row).getByTestId('card-id-chip').textContent).toBe('dragon-sighting');
    expect(within(row).getByText('Dragon Sighting')).toBeTruthy();
    expect(within(row).queryByTestId('card-copies-pill')).toBeNull();
  });

  it('shows a copies pill when count is greater than 1', () => {
    render(<DeckEditor />);

    const row = screen.getByTestId('card-row-c1'); // goblin-ambush, count 3
    expect(within(row).getByTestId('card-copies-pill').textContent).toBe('3 copies');
  });

  it('toggles expansion on click, and reorder buttons do not toggle it', () => {
    render(<DeckEditor />);

    const row = screen.getByTestId('card-row-c2'); // collapsed in the seed
    expect(within(row).queryByPlaceholderText('Goblin Ambush')).toBeNull();

    fireEvent.click(within(row).getByTestId('card-id-chip'));
    expect(within(row).getByPlaceholderText('Goblin Ambush')).toBeTruthy();

    fireEvent.click(within(row).getByTitle('Move up'));
    expect(within(row).queryByPlaceholderText('Goblin Ambush')).toBeTruthy();
  });
});

describe('expanded card row fields', () => {
  it('edits id, title, copies, text, and strips non-digits from copies', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c3'); // ancient-ruins, pre-expanded in seed

    const idInput = within(row).getByPlaceholderText('goblin-ambush') as HTMLInputElement;
    expect(idInput.value).toBe('ancient-ruins');
    fireEvent.change(idInput, { target: { value: 'ancient-ruins-2' } });
    expect(currentDeck().cards[2].id).toBe('ancient-ruins-2');

    const titleInput = within(row).getByPlaceholderText('Goblin Ambush') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    expect(currentDeck().cards[2].title).toBe('New Title');

    const textArea = within(row).getByPlaceholderText(
      'A band of goblins leaps from the bushes!',
    ) as HTMLTextAreaElement;
    fireEvent.change(textArea, { target: { value: 'New text.' } });
    expect(currentDeck().cards[2].text).toBe('New text.');

    // A number input rejects non-numeric text outright (its value setter
    // nulls "2abc" to ""), but does pass through syntactically-valid
    // negative/decimal notation — which the strip-non-digits contract must
    // still sanitize down to a bare positive integer string.
    const copiesInput = within(row).getByDisplayValue('1') as HTMLInputElement;
    fireEvent.change(copiesInput, { target: { value: '-2' } });
    expect(currentDeck().cards[2].count).toBe('2');
  });

  it('adds, edits, and removes metadata rows', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c3');

    expect(screen.getAllByTestId(/meta-row-/)).toHaveLength(2);

    fireEvent.click(within(row).getByText('+ metadata'));
    expect(currentDeck().cards[2].meta).toHaveLength(3);

    const metaRows = within(row).getAllByTestId(/meta-row-/);
    const newRow = metaRows[2];
    fireEvent.change(within(newRow).getByPlaceholderText('category'), {
      target: { value: 'rarity' },
    });
    fireEvent.change(within(newRow).getByPlaceholderText('exploration'), {
      target: { value: 'rare' },
    });
    expect(currentDeck().cards[2].meta[2]).toMatchObject({ key: 'rarity', value: 'rare' });

    fireEvent.click(within(newRow).getByText('✕'));
    expect(currentDeck().cards[2].meta).toHaveLength(2);
  });

  it('shows the error state on both rows sharing a duplicate metadata key', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c3'); // has 'category' and 'image' keys

    const metaRows = within(row).getAllByTestId(/meta-row-/);
    const imageKeyInput = within(metaRows[1]).getByDisplayValue('image') as HTMLInputElement;
    fireEvent.change(imageKeyInput, { target: { value: 'category' } });

    const [firstKey, secondKey] = within(row)
      .getAllByTestId(/meta-row-/)
      .map((r) => within(r).getByDisplayValue('category') as HTMLInputElement);
    expect(firstKey.className).toContain('field-input--bad');
    expect(secondKey.className).toContain('field-input--bad');
  });

  it('duplicates a card, inserting the copy after the original with an -copy id suffix', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c3'); // ancient-ruins at index 2

    fireEvent.click(within(row).getByText('⧉ duplicate'));

    const cards = currentDeck().cards;
    expect(cards).toHaveLength(5);
    expect(cards[3].id).toBe('ancient-ruins-copy');
    expect(cards[3].expanded).toBe(true);
    expect(cards[3].cid).not.toBe(cards[2].cid);
    // Metadata rows get fresh rids, not shared with the original.
    expect(cards[3].meta[0].rid).not.toBe(cards[2].meta[0].rid);
  });

  it('removes a card after confirmation, and does nothing when cancelled', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c3');

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(within(row).getByText('✕ remove card'));
    expect(currentDeck().cards).toHaveLength(4);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(within(row).getByText('✕ remove card'));
    expect(currentDeck().cards).toHaveLength(3);
    expect(confirmSpy).toHaveBeenCalledWith('Remove card “ancient-ruins”?');
  });
});

describe('reordering', () => {
  it('▲ moves a card up, ▼ moves it back down', () => {
    render(<DeckEditor />);
    const idsInOrder = () => currentDeck().cards.map((c) => c.id);
    expect(idsInOrder()).toEqual([
      'goblin-ambush',
      'dragon-sighting',
      'ancient-ruins',
      'sudden-storm',
    ]);

    const row = screen.getByTestId('card-row-c2'); // dragon-sighting
    fireEvent.click(within(row).getByTitle('Move up'));
    expect(idsInOrder()).toEqual([
      'dragon-sighting',
      'goblin-ambush',
      'ancient-ruins',
      'sudden-storm',
    ]);

    fireEvent.click(within(row).getByTitle('Move down'));
    expect(idsInOrder()).toEqual([
      'goblin-ambush',
      'dragon-sighting',
      'ancient-ruins',
      'sudden-storm',
    ]);
  });

  it('the first row cannot move up further, the last cannot move down further', () => {
    render(<DeckEditor />);
    const idsInOrder = () => currentDeck().cards.map((c) => c.id);

    const firstRow = screen.getByTestId('card-row-c1');
    fireEvent.click(within(firstRow).getByTitle('Move up'));
    expect(idsInOrder()[0]).toBe('goblin-ambush');

    const lastRow = screen.getByTestId('card-row-c4');
    fireEvent.click(within(lastRow).getByTitle('Move down'));
    expect(idsInOrder()[3]).toBe('sudden-storm');
  });

  it('▲/▼ operate on the previous/next VISIBLE card, skipping hidden ones', () => {
    render(<DeckEditor />);
    const uid = currentDeck().uid;
    act(() => {
      useWorkspace.getState().updateDeck(uid, (d) => {
        d.cards[0].id = 'keep-goblin-ambush'; // index 0
        d.cards[2].id = 'keep-ancient-ruins'; // index 2; dragon-sighting (index 1) stays hidden
      });
    });

    fireEvent.change(screen.getByPlaceholderText('filter…'), { target: { value: 'keep' } });

    const idsInOrder = () => currentDeck().cards.map((c) => c.id);
    const secondVisibleRow = screen.getByTestId('card-row-c3'); // keep-ancient-ruins, second visible
    fireEvent.click(within(secondVisibleRow).getByTitle('Move up'));

    // Swaps with the previous VISIBLE card (index 0), jumping over the
    // hidden dragon-sighting at index 1, which stays put.
    expect(idsInOrder()).toEqual([
      'keep-ancient-ruins',
      'dragon-sighting',
      'keep-goblin-ambush',
      'sudden-storm',
    ]);
  });

  it('disables ▲ on the first visible row and ▼ on the last visible row, even with hidden cards on either side', () => {
    render(<DeckEditor />);
    const uid = currentDeck().uid;
    act(() => {
      useWorkspace.getState().updateDeck(uid, (d) => {
        d.cards[0].id = 'keep-goblin-ambush';
        d.cards[2].id = 'keep-ancient-ruins';
      });
    });

    fireEvent.change(screen.getByPlaceholderText('filter…'), { target: { value: 'keep' } });

    const firstVisible = screen.getByTestId('card-row-c1');
    const lastVisible = screen.getByTestId('card-row-c3');
    expect((within(firstVisible).getByTitle('Move up') as HTMLButtonElement).disabled).toBe(true);
    expect((within(lastVisible).getByTitle('Move down') as HTMLButtonElement).disabled).toBe(true);
    // The opposite direction at each end of the visible list stays enabled.
    expect((within(firstVisible).getByTitle('Move down') as HTMLButtonElement).disabled).toBe(false);
    expect((within(lastVisible).getByTitle('Move up') as HTMLButtonElement).disabled).toBe(false);
  });

  it('drag-and-drop via the handle reorders onto a sibling row', () => {
    render(<DeckEditor />);
    const idsInOrder = () => currentDeck().cards.map((c) => c.id);

    const src = screen.getByTestId('card-row-c1'); // goblin-ambush
    const target = screen.getByTestId('card-row-c3'); // ancient-ruins

    fireEvent.dragStart(src);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(idsInOrder()).toEqual([
      'dragon-sighting',
      'ancient-ruins',
      'goblin-ambush',
      'sudden-storm',
    ]);
  });
});

// Pins each deriveCardIssues branch individually (empty id, colon id, empty
// text, count of 0) so a validate.ts wording change that silently breaks the
// string-matching in deriveCardIssues fails loudly here, not just in the
// combined duplicate-id scenario below.
describe('inline error states derived from validateDeckModel', () => {
  it('flags the id chip and id field when the id is emptied', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c4'); // sudden-storm, collapsed

    fireEvent.click(within(row).getByTestId('card-id-chip')); // expand
    const idInput = within(row).getByPlaceholderText('goblin-ambush') as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: '' } });

    expect(within(row).getByTestId('card-id-chip').className).toContain('card-row-id--error');
    expect(idInput.className).toContain('field-input--bad');
    expect(row.className).toContain('card-row--bad');
  });

  it('flags the id chip and id field when the id contains a colon', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c2'); // dragon-sighting, collapsed

    fireEvent.click(within(row).getByTestId('card-id-chip'));
    const idInput = within(row).getByPlaceholderText('goblin-ambush') as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'dragon:sighting' } });

    expect(within(row).getByTestId('card-id-chip').className).toContain('card-row-id--error');
    expect(idInput.className).toContain('field-input--bad');
    expect(row.className).toContain('card-row--bad');
  });

  it('flags the text field when text is emptied', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c1'); // goblin-ambush, collapsed

    fireEvent.click(within(row).getByTestId('card-id-chip'));
    const textArea = within(row).getByPlaceholderText(
      'A band of goblins leaps from the bushes!',
    ) as HTMLTextAreaElement;
    fireEvent.change(textArea, { target: { value: '' } });

    expect(textArea.className).toContain('field-input--bad');
    expect(row.className).toContain('card-row--bad');
  });

  it('flags the copies field when count is 0, without red-bordering the whole card', () => {
    render(<DeckEditor />);
    const row = screen.getByTestId('card-row-c3'); // ancient-ruins, pre-expanded

    const copiesInput = within(row).getByDisplayValue('1') as HTMLInputElement;
    fireEvent.change(copiesInput, { target: { value: '0' } });

    expect(currentDeck().cards[2].count).toBe('0');
    expect(copiesInput.className).toContain('field-input--bad');
    // Matches the prototype: only id/text errors border the whole card face.
    expect(row.className).not.toContain('card-row--bad');
  });
});

describe('duplicate card id validation', () => {
  it('shows the error state on both offending id chips, and the header pill reads 1 problem', () => {
    render(
      <>
        <Header />
        <DeckEditor />
      </>,
    );

    act(() => {
      const uid = currentDeck().uid;
      useWorkspace.getState().updateDeck(uid, (d) => {
        d.cards[1].id = 'goblin-ambush';
      });
    });

    const row1 = screen.getByTestId('card-row-c1');
    const row2 = screen.getByTestId('card-row-c2');
    expect(within(row1).getByTestId('card-id-chip').className).toContain('card-row-id--error');
    expect(within(row2).getByTestId('card-id-chip').className).toContain('card-row-id--error');
    expect(screen.getByTestId('header-status').textContent).toContain('1 problem');
  });

  it('does not bleed a duplicate-metadata-key flag from one id-twin onto the other', () => {
    render(
      <>
        <Header />
        <DeckEditor />
      </>,
    );

    act(() => {
      const uid = currentDeck().uid;
      useWorkspace.getState().updateDeck(uid, (d) => {
        d.cards[2].id = 'goblin-ambush'; // ancient-ruins now id-twin of goblin-ambush
        d.cards[0].meta = [
          { rid: 'x1', key: 'category', value: 'a' },
          { rid: 'x2', key: 'category', value: 'b' },
        ];
      });
    });

    fireEvent.click(within(screen.getByTestId('card-row-c1')).getByTestId('card-id-chip'));
    const c1Row = screen.getByTestId('card-row-c1');
    const c1MetaKeys = within(c1Row)
      .getAllByTestId(/meta-row-/)
      .map((r) => within(r).getByPlaceholderText('category') as HTMLInputElement);
    expect(c1MetaKeys[0].className).toContain('field-input--bad');
    expect(c1MetaKeys[1].className).toContain('field-input--bad');

    // c3 (ancient-ruins, now id-twin of c1) has its own single 'category' key
    // with no duplicate within c3 itself, so it must not inherit c1's error.
    const c3Row = screen.getByTestId('card-row-c3');
    const c3CategoryInput = within(c3Row).getByDisplayValue('category') as HTMLInputElement;
    expect(c3CategoryInput.className).not.toContain('field-input--bad');
  });
});
