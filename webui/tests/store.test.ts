// ABOUTME: Tests for the model/logic helpers, the seed deck, parsedToDeck, and
// ABOUTME: the zustand workspace store — mutations, selection, editRevision, persistence.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadText, newUid, randomSeed, slug } from '../src/logic/helpers';
import { seedDeck } from '../src/model/seed';
import { initialState, parsedToDeck, useWorkspace } from '../src/model/store';
import type { ParsedDeck } from '../src/engine/engine';
import type { Deck } from '../src/model/types';

const STORAGE_KEY = 'deck-forge-workspace';

function resetStore() {
  const seed = seedDeck();
  useWorkspace.setState({ decks: [seed], selUid: seed.uid, editRevision: 0, fileHandles: {} });
}

// Simulates a genuine first load, where the live store holds the empty initial
// state rather than the seeded fixture that beforeEach installs.
function resetStoreEmpty() {
  useWorkspace.setState({ decks: [], selUid: null, editRevision: 0 });
}

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

describe('helpers', () => {
  describe('slug', () => {
    it('lowercases and replaces non-alphanumeric runs with a single hyphen', () => {
      expect(slug('Fate Oracle')).toBe('fate-oracle');
    });

    it('trims leading/trailing hyphens', () => {
      expect(slug('  --Weird Name!!--  ')).toBe('weird-name');
    });

    it('falls back to "deck" for an empty or all-punctuation name', () => {
      expect(slug('')).toBe('deck');
      expect(slug('!!!')).toBe('deck');
    });
  });

  describe('newUid', () => {
    it('generates distinct ids on successive calls', () => {
      expect(newUid()).not.toBe(newUid());
    });
  });

  describe('randomSeed', () => {
    it('returns a non-negative integer within u32 range', () => {
      const n = randomSeed();
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(2 ** 32);
    });
  });

  describe('downloadText', () => {
    it('creates an object URL for a Blob and clicks a temporary anchor', () => {
      const createObjectURL = vi.fn((_obj: Blob) => 'blob:mock');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      downloadText('fate-oracle.yaml', 'name: Fate Oracle\n');

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });
  });
});

describe('seed deck', () => {
  it('has 4 unique cards and 7 total instances', () => {
    const deck = seedDeck();
    expect(deck.cards).toHaveLength(4);
    const total = deck.cards.reduce((sum, c) => sum + (parseInt(c.count, 10) || 1), 0);
    expect(total).toBe(7);
  });

  it('matches the Global Constraints seed contract', () => {
    const deck = seedDeck();
    expect(deck.name).toBe('Fate Oracle');
    expect(deck.description).toBe('Draw to reveal what fate has in store');
    expect(deck.containers).toEqual(['discard']);
    expect(deck.cards.map((c) => [c.id, c.title, c.count])).toEqual([
      ['goblin-ambush', 'Goblin Ambush', '3'],
      ['dragon-sighting', 'Dragon Sighting', '1'],
      ['ancient-ruins', 'Ancient Ruins', '1'],
      ['sudden-storm', 'Sudden Storm', '2'],
    ]);
    const ruins = deck.cards.find((c) => c.id === 'ancient-ruins')!;
    expect(ruins.meta.map((m) => [m.key, m.value])).toEqual([
      ['category', 'exploration'],
      ['image', 'ancient-ruins.png'],
    ]);
  });
});

describe('parsedToDeck', () => {
  it('maps a fully-populated ParsedDeck to the editor model', () => {
    const parsed: ParsedDeck = {
      name: 'Fate Oracle',
      description: 'Draw to reveal',
      containers: ['discard'],
      cards: [
        { id: 'goblin-ambush', title: 'Goblin Ambush', text: 'Goblins!', count: 3, metadata: null },
        {
          id: 'ancient-ruins',
          title: 'Ancient Ruins',
          text: 'Ruins.',
          count: null,
          metadata: { category: 'exploration', image: 'ancient-ruins.png' },
        },
      ],
    };
    const deck = parsedToDeck(parsed);

    expect(deck.name).toBe('Fate Oracle');
    expect(deck.description).toBe('Draw to reveal');
    expect(deck.containers).toEqual(['discard']);
    expect(deck.uid).toBeTruthy();
    expect(deck.cards).toHaveLength(2);
    expect(deck.cards[0]).toMatchObject({
      id: 'goblin-ambush',
      title: 'Goblin Ambush',
      text: 'Goblins!',
      count: '3',
      meta: [],
      expanded: false,
    });
    expect(deck.cards[0].cid).toBeTruthy();
    expect(deck.cards[1].count).toBe('1');
    expect(deck.cards[1].meta.map((m) => [m.key, m.value])).toEqual([
      ['category', 'exploration'],
      ['image', 'ancient-ruins.png'],
    ]);
  });

  it('defaults null description/containers/title to empty', () => {
    const parsed: ParsedDeck = {
      name: 'X',
      description: null,
      containers: null,
      cards: [{ id: 'a', title: null, text: 't', count: null, metadata: null }],
    };
    const deck = parsedToDeck(parsed);
    expect(deck.description).toBe('');
    expect(deck.containers).toEqual([]);
    expect(deck.cards[0].title).toBe('');
  });
});

describe('initialState', () => {
  it('is an empty workspace — the cabinet lists only imported or created decks', () => {
    expect(initialState()).toEqual({ decks: [], selUid: null, editRevision: 0, fileHandles: {} });
  });
});

describe('startNewWorkspace', () => {
  it('resets every workspace field and removes its persisted draft', () => {
    useWorkspace.getState().addDeck();
    const uid = useWorkspace.getState().selUid as string;
    useWorkspace.getState().bindFile(uid, { name: 'deck.yaml' } as unknown as FileSystemFileHandle);
    useWorkspace.getState().updateDeck(uid, (deck) => {
      deck.name = 'Changed Deck';
    });
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    useWorkspace.getState().startNewWorkspace();

    const { decks, selUid, editRevision, fileHandles } = useWorkspace.getState();
    expect({ decks, selUid, editRevision, fileHandles }).toEqual(initialState());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('select', () => {
  it('sets selUid', () => {
    useWorkspace.getState().addDeck();
    const seedUid = useWorkspace.getState().decks[0].uid;
    useWorkspace.getState().select(seedUid);
    expect(useWorkspace.getState().selUid).toBe(seedUid);
  });

  it('accepts null to clear the selection', () => {
    useWorkspace.getState().select(null);
    expect(useWorkspace.getState().selUid).toBeNull();
  });
});

describe('addDeck', () => {
  it('appends "New Deck" with one blank expanded card and selects it', () => {
    useWorkspace.getState().addDeck();
    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(2);
    const added = state.decks[1];
    expect(added.name).toBe('New Deck');
    expect(added.description).toBe('');
    expect(added.containers).toEqual([]);
    expect(added.cards).toEqual([
      { cid: added.cards[0].cid, id: '', title: '', text: '', count: '1', meta: [], expanded: true },
    ]);
    expect(state.selUid).toBe(added.uid);
  });

  it('gives each added deck a fresh uid', () => {
    useWorkspace.getState().addDeck();
    useWorkspace.getState().addDeck();
    const [, first, second] = useWorkspace.getState().decks;
    expect(first.uid).not.toBe(second.uid);
  });
});

describe('deleteDeck', () => {
  it('selects the next remaining deck when the selected middle deck is removed', () => {
    useWorkspace.getState().addDeck();
    useWorkspace.getState().addDeck();
    const [seed, second, third] = useWorkspace.getState().decks;
    useWorkspace.getState().select(second.uid);

    useWorkspace.getState().deleteDeck(second.uid);

    const state = useWorkspace.getState();
    expect(state.decks.map((d) => d.uid)).toEqual([seed.uid, third.uid]);
    expect(state.selUid).toBe(third.uid);
  });

  it('falls back to the previous deck when the last deck is removed', () => {
    useWorkspace.getState().addDeck();
    const [seed, second] = useWorkspace.getState().decks;
    useWorkspace.getState().select(second.uid);

    useWorkspace.getState().deleteDeck(second.uid);

    expect(useWorkspace.getState().selUid).toBe(seed.uid);
  });

  it('selects null when the only deck is removed', () => {
    const seed = useWorkspace.getState().decks[0];

    useWorkspace.getState().deleteDeck(seed.uid);

    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(0);
    expect(state.selUid).toBeNull();
  });

  it('leaves the selection untouched when deleting a non-selected deck', () => {
    useWorkspace.getState().addDeck();
    const [seed, second] = useWorkspace.getState().decks;
    useWorkspace.getState().select(seed.uid);

    useWorkspace.getState().deleteDeck(second.uid);

    const state = useWorkspace.getState();
    expect(state.decks.map((d) => d.uid)).toEqual([seed.uid]);
    expect(state.selUid).toBe(seed.uid);
  });
});

describe('importDeck', () => {
  it('adds the given deck and selects it', () => {
    const imported = parsedToDeck({ name: 'Imported', description: null, containers: null, cards: [] });

    useWorkspace.getState().importDeck(imported);

    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(2);
    expect(state.decks[1]).toEqual(imported);
    expect(state.selUid).toBe(imported.uid);
  });
});

describe('updateDeck', () => {
  it('mutates the targeted deck via the draft function and bumps editRevision', () => {
    const seedUid = useWorkspace.getState().decks[0].uid;

    useWorkspace.getState().updateDeck(seedUid, (d) => {
      d.name = 'Renamed';
    });

    const state = useWorkspace.getState();
    expect(state.decks[0].name).toBe('Renamed');
    expect(state.editRevision).toBe(1);
  });

  it('bumps editRevision on every call', () => {
    const seedUid = useWorkspace.getState().decks[0].uid;
    useWorkspace.getState().updateDeck(seedUid, (d) => {
      d.name = 'One';
    });
    useWorkspace.getState().updateDeck(seedUid, (d) => {
      d.name = 'Two';
    });
    expect(useWorkspace.getState().editRevision).toBe(2);
  });

  it('does not mutate other decks', () => {
    useWorkspace.getState().addDeck();
    const [seed, added] = useWorkspace.getState().decks;

    useWorkspace.getState().updateDeck(seed.uid, (d) => {
      d.name = 'Renamed Seed';
    });

    expect(useWorkspace.getState().decks[1]).toEqual(added);
  });
});

describe('toggleCardExpanded', () => {
  it('flips a card\'s expanded flag without bumping editRevision', () => {
    const seedUid = useWorkspace.getState().decks[0].uid;

    useWorkspace.getState().toggleCardExpanded(seedUid, 'c1');

    const state = useWorkspace.getState();
    expect(state.decks[0].cards.find((c) => c.cid === 'c1')!.expanded).toBe(true);
    expect(state.editRevision).toBe(0);
  });

  it('collapses an already-expanded card, still without bumping editRevision', () => {
    const seedUid = useWorkspace.getState().decks[0].uid;

    useWorkspace.getState().toggleCardExpanded(seedUid, 'c3');

    const state = useWorkspace.getState();
    expect(state.decks[0].cards.find((c) => c.cid === 'c3')!.expanded).toBe(false);
    expect(state.editRevision).toBe(0);
  });

  it('does not disturb a subsequent content edit\'s revision bump', () => {
    const seedUid = useWorkspace.getState().decks[0].uid;

    useWorkspace.getState().toggleCardExpanded(seedUid, 'c1');
    useWorkspace.getState().updateDeck(seedUid, (d) => {
      d.name = 'Renamed';
    });

    expect(useWorkspace.getState().editRevision).toBe(1);
  });

  it('leaves other cards and other decks untouched', () => {
    useWorkspace.getState().addDeck();
    const [seed, added] = useWorkspace.getState().decks;
    const c2Before = seed.cards.find((c) => c.cid === 'c2')!.expanded;

    useWorkspace.getState().toggleCardExpanded(seed.uid, 'c1');

    const state = useWorkspace.getState();
    expect(state.decks[0].cards.find((c) => c.cid === 'c2')!.expanded).toBe(c2Before);
    expect(state.decks[1]).toEqual(added);
  });
});

describe('persistence', () => {
  function readPersisted(): { state: { decks: unknown; selUid: unknown }; version: number } | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  it('writes {decks, selUid} to the deck-forge-workspace key on every mutation', () => {
    useWorkspace.getState().addDeck();

    const persisted = readPersisted();
    expect(persisted).not.toBeNull();
    expect(persisted!.state.decks).toHaveLength(2);
    expect(persisted!.state.selUid).toBe(useWorkspace.getState().selUid);
    expect(persisted!.state).not.toHaveProperty('editRevision');
  });

  it('round-trips a saved workspace through rehydrate', async () => {
    // Written directly to storage (not via the store) to simulate a fresh
    // page load reading back a previous session's save, without the store's
    // own persist subscription clobbering it in between.
    const other: Deck = { ...seedDeck(), uid: 'other', name: 'Other Deck' };
    const decks = [seedDeck(), other];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { decks, selUid: 'other' }, version: 0 }));

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toEqual(decks);
    expect(state.selUid).toBe('other');
  });

  it('keeps the empty workspace when storage is absent', async () => {
    resetStoreEmpty();
    localStorage.removeItem(STORAGE_KEY);

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toEqual([]);
    expect(state.selUid).toBeNull();
  });

  it('keeps the empty workspace when storage holds corrupt JSON', async () => {
    resetStoreEmpty();
    localStorage.setItem(STORAGE_KEY, '{ this is not json');

    await expect(useWorkspace.persist.rehydrate()).resolves.not.toThrow();

    const state = useWorkspace.getState();
    expect(state.decks).toEqual([]);
    expect(state.selUid).toBeNull();
  });

  it('keeps the empty workspace when storage holds valid JSON of the wrong shape', async () => {
    resetStoreEmpty();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { decks: 'not-an-array' }, version: 0 }));

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toEqual([]);
    expect(state.selUid).toBeNull();
  });

  it('keeps the empty workspace when a persisted document is itself empty', async () => {
    resetStoreEmpty();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { decks: [], selUid: null }, version: 0 }));

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toEqual([]);
    expect(state.selUid).toBeNull();
  });

  it('drops a deck missing cards and keeps the surviving deck', async () => {
    const good: Deck = { ...seedDeck(), uid: 'good', name: 'Good Deck' };
    const { cards: _cards, ...badWithoutCards } = seedDeck();
    const bad = { ...badWithoutCards, uid: 'bad', name: 'Bad Deck' };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { decks: [good, bad], selUid: 'good' }, version: 0 }),
    );

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].uid).toBe('good');
  });

  it('nulls selUid when it references a deck dropped by validation, even if another deck survives', async () => {
    const good: Deck = { ...seedDeck(), uid: 'good', name: 'Good Deck' };
    const { cards: _cards, ...badWithoutCards } = seedDeck();
    const bad = { ...badWithoutCards, uid: 'bad', name: 'Bad Deck' };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { decks: [good, bad], selUid: 'bad' }, version: 0 }),
    );

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].uid).toBe('good');
    expect(state.selUid).toBeNull();
  });

  it('keeps the empty workspace when every persisted deck is malformed', async () => {
    resetStoreEmpty();
    const bad = { uid: 'bad', name: 'Bad Deck' };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { decks: [bad], selUid: 'bad' }, version: 0 }),
    );

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toEqual([]);
    expect(state.selUid).toBeNull();
  });

  it('keeps the empty workspace when a card is missing its string fields', async () => {
    resetStoreEmpty();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          decks: [{ uid: 'x', name: 'D', containers: [], cards: [{ meta: [] }] }],
          selUid: 'x',
        },
        version: 0,
      }),
    );

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toEqual([]);
    expect(state.selUid).toBeNull();
  });

  it('drops a deck whose card has a non-string field but keeps a valid sibling', async () => {
    const good: Deck = { ...seedDeck(), uid: 'good', name: 'Good Deck' };
    const corrupt = {
      uid: 'corrupt',
      name: 'Corrupt Deck',
      description: '',
      containers: [],
      // count is a number here, not the string the Card type requires.
      cards: [{ cid: 'c1', id: 'ghost', title: '', text: 'Boo', count: 1, meta: [], expanded: false }],
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { decks: [good, corrupt], selUid: 'good' }, version: 0 }),
    );

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].uid).toBe('good');
  });

  it('drops a deck with a non-string name but keeps a valid sibling', async () => {
    const good: Deck = { ...seedDeck(), uid: 'good', name: 'Good Deck' };
    const corrupt = {
      uid: 'corrupt',
      name: 123,
      description: '',
      containers: [],
      cards: [{ cid: 'c1', id: 'ghost', title: '', text: 'Boo', count: '1', meta: [], expanded: false }],
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { decks: [good, corrupt], selUid: 'good' }, version: 0 }),
    );

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].uid).toBe('good');
  });

  it('drops a deck whose card is missing cid but keeps a valid sibling', async () => {
    const good: Deck = { ...seedDeck(), uid: 'good', name: 'Good Deck' };
    const corrupt = {
      uid: 'corrupt',
      name: 'Corrupt Deck',
      description: '',
      containers: [],
      cards: [{ id: 'ghost', title: '', text: 'Boo', count: '1', meta: [], expanded: false }],
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { decks: [good, corrupt], selUid: 'good' }, version: 0 }),
    );

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].uid).toBe('good');
  });

  it('drops a deck whose card has a malformed meta row but keeps a valid sibling', async () => {
    const good: Deck = { ...seedDeck(), uid: 'good', name: 'Good Deck' };
    const corrupt = {
      uid: 'corrupt',
      name: 'Corrupt Deck',
      description: '',
      containers: [],
      cards: [
        {
          cid: 'c1',
          id: 'ghost',
          title: '',
          text: 'Boo',
          count: '1',
          // value is a number here, not the string the MetaRow type requires.
          meta: [{ rid: 'm1', key: 'category', value: 7 }],
          expanded: false,
        },
      ],
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { decks: [good, corrupt], selUid: 'good' }, version: 0 }),
    );

    await useWorkspace.persist.rehydrate();

    const state = useWorkspace.getState();
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].uid).toBe('good');
  });

  it('keeps file handles out of the persisted localStorage blob', () => {
    useWorkspace.getState().addDeck();
    const uid = useWorkspace.getState().selUid as string;
    useWorkspace.getState().bindFile(uid, { name: 'deck.yaml' } as unknown as FileSystemFileHandle);

    const persisted = readPersisted();
    expect(persisted!.state).not.toHaveProperty('fileHandles');
    expect(useWorkspace.getState().fileHandles[uid]).toBeTruthy();
  });

  it('drops a deck file handle when the deck is deleted', () => {
    const { addDeck, bindFile, deleteDeck } = useWorkspace.getState();
    addDeck();
    const uid = useWorkspace.getState().selUid as string;
    bindFile(uid, { name: 'deck.yaml' } as unknown as FileSystemFileHandle);
    expect(useWorkspace.getState().fileHandles[uid]).toBeTruthy();

    deleteDeck(uid);
    expect(useWorkspace.getState().fileHandles[uid]).toBeUndefined();
  });
});
