// ABOUTME: Zustand store holding the Deck Forge workspace (decks + selection),
// ABOUTME: auto-persisted to localStorage; editRevision lets consumers invalidate test-draw sessions.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ParsedDeck } from '../engine/engine';
import { newUid } from '../logic/helpers';
import { seedDeck } from './seed';
import type { Card, Deck } from './types';

const STORAGE_KEY = 'deck-forge-workspace';

interface WorkspaceData {
  decks: Deck[];
  selUid: string | null;
  editRevision: number;
}

export interface WorkspaceState extends WorkspaceData {
  select(uid: string | null): void;
  addDeck(): void;
  deleteDeck(uid: string): void;
  importDeck(deck: Deck): void;
  updateDeck(uid: string, fn: (d: Deck) => void): void;
}

function initialState(): WorkspaceData {
  const seed = seedDeck();
  return { decks: [seed], selUid: seed.uid, editRevision: 0 };
}

export function blankCard(): Card {
  return { cid: newUid(), id: '', title: '', text: '', count: '1', meta: [], expanded: true };
}

// The uid of the deck adjacent to a just-removed one in the post-filter
// array: the deck that slid into the removed slot (the "next" survivor),
// falling back to the one before it, else none remain.
function selectNextSurviving(decksAfterRemoval: Deck[], removedIndex: number): string | null {
  if (removedIndex < decksAfterRemoval.length) return decksAfterRemoval[removedIndex].uid;
  if (removedIndex - 1 >= 0) return decksAfterRemoval[removedIndex - 1].uid;
  return null;
}

type PersistedDoc = Pick<WorkspaceData, 'decks' | 'selUid'>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidCard(value: unknown): value is Card {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.text === 'string' &&
    typeof value.count === 'string' &&
    Array.isArray(value.meta)
  );
}

function isValidDeck(value: unknown): value is Deck {
  return (
    isObject(value) &&
    typeof value.uid === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    Array.isArray(value.containers) &&
    Array.isArray(value.cards) &&
    value.cards.every(isValidCard)
  );
}

// Validates a blob read back from localStorage. Returns a usable document, or
// null when the shape has drifted or is corrupt — the caller then keeps the
// already-seeded current state instead of crashing on a stale/foreign schema.
// Malformed decks within an otherwise-valid document are dropped rather than
// rejecting the whole document; if none survive, this falls back to null too.
function coerceDocument(persisted: unknown): PersistedDoc | null {
  if (!isObject(persisted)) return null;
  if (!Array.isArray(persisted.decks)) return null;
  const decks = persisted.decks.filter(isValidDeck);
  if (!decks.length) return null;
  const selUid = typeof persisted.selUid === 'string' ? persisted.selUid : null;
  return { decks, selUid };
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      ...initialState(),

      select: (uid) => set({ selUid: uid }),

      addDeck: () =>
        set((state) => {
          const deck: Deck = {
            uid: newUid(),
            name: 'New Deck',
            description: '',
            containers: [],
            cards: [blankCard()],
          };
          return { decks: [...state.decks, deck], selUid: deck.uid };
        }),

      deleteDeck: (uid) =>
        set((state) => {
          const removedIndex = state.decks.findIndex((d) => d.uid === uid);
          if (removedIndex < 0) return state;
          const decks = state.decks.filter((d) => d.uid !== uid);
          if (state.selUid !== uid) return { decks };
          return { decks, selUid: selectNextSurviving(decks, removedIndex) };
        }),

      importDeck: (deck) => set((state) => ({ decks: [...state.decks, deck], selUid: deck.uid })),

      updateDeck: (uid, fn) =>
        set((state) => {
          const decks = state.decks.map((d) => {
            if (d.uid !== uid) return d;
            const draft = structuredClone(d);
            fn(draft);
            return draft;
          });
          return { decks, editRevision: state.editRevision + 1 };
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: ({ decks, selUid }) => ({ decks, selUid }),
      merge: (persisted, current) => {
        const doc = coerceDocument(persisted);
        return doc ? { ...current, ...doc } : current;
      },
    },
  ),
);

/** Maps the engine's parsed deck (wasm parse_deck result) to the editor model. */
export function parsedToDeck(p: ParsedDeck): Deck {
  return {
    uid: newUid(),
    name: p.name,
    description: p.description ?? '',
    containers: p.containers ?? [],
    cards: p.cards.map((c) => ({
      cid: newUid(),
      id: c.id,
      title: c.title ?? '',
      text: c.text,
      count: c.count == null ? '1' : String(c.count),
      meta: c.metadata
        ? Object.entries(c.metadata).map(([key, value]) => ({ rid: newUid(), key, value }))
        : [],
      expanded: false,
    })),
  };
}
