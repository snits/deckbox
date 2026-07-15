// ABOUTME: Zustand store holding the Deck Forge workspace (decks + selection),
// ABOUTME: auto-persisted to localStorage; editRevision lets consumers invalidate test-draw sessions.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ParsedDeck } from '../engine/engine';
import { newUid } from '../logic/helpers';
import type { ImageSourceMap } from '../logic/imageAssets';
import type { Card, Deck, MetaRow } from './types';

const STORAGE_KEY = 'deck-forge-workspace';

interface WorkspaceData {
  decks: Deck[];
  selUid: string | null;
  editRevision: number;
  fileHandles: Record<string, FileSystemFileHandle>;
  imageSources: Record<string, ImageSourceMap>;
}

export interface WorkspaceState extends WorkspaceData {
  startNewWorkspace(): void;
  select(uid: string | null): void;
  addDeck(): void;
  deleteDeck(uid: string): void;
  importDeck(deck: Deck, imageSources?: ImageSourceMap): void;
  updateDeck(uid: string, fn: (d: Deck) => void): void;
  toggleCardExpanded(deckUid: string, cid: string): void;
  bindFile(uid: string, handle: FileSystemFileHandle): void;
}

// The cabinet is not a library: a fresh workspace lists no decks. Decks enter
// only when the user creates (addDeck) or imports (importDeck) one.
export function initialState(): WorkspaceData {
  return { decks: [], selUid: null, editRevision: 0, fileHandles: {}, imageSources: {} };
}

function revokeImageSources(sources: ImageSourceMap | undefined): void {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  for (const source of Object.values(sources ?? {})) URL.revokeObjectURL(source);
}

function revokeAllImageSources(sources: Record<string, ImageSourceMap>): void {
  for (const deckSources of Object.values(sources)) revokeImageSources(deckSources);
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

function isValidMetaRow(value: unknown): value is MetaRow {
  return (
    isObject(value) &&
    typeof value.rid === 'string' &&
    typeof value.key === 'string' &&
    typeof value.value === 'string'
  );
}

function isValidCard(value: unknown): value is Card {
  return (
    isObject(value) &&
    typeof value.cid === 'string' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.text === 'string' &&
    typeof value.count === 'string' &&
    Array.isArray(value.meta) &&
    value.meta.every(isValidMetaRow)
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
// current state instead of crashing on a stale/foreign schema. Malformed decks
// within an otherwise-valid document are dropped rather than rejecting the whole
// document. An empty document is indistinguishable from a fully-malformed one
// here: both yield no surviving decks and return null, falling back to current —
// which on first hydration is the empty workspace.
function coerceDocument(persisted: unknown): PersistedDoc | null {
  if (!isObject(persisted)) return null;
  if (!Array.isArray(persisted.decks)) return null;
  const decks = persisted.decks.filter(isValidDeck);
  if (!decks.length) return null;
  const rawSelUid = typeof persisted.selUid === 'string' ? persisted.selUid : null;
  const selUid = rawSelUid && decks.some((d) => d.uid === rawSelUid) ? rawSelUid : null;
  return { decks, selUid };
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      ...initialState(),

      startNewWorkspace: () => {
        revokeAllImageSources(useWorkspace.getState().imageSources);
        set(initialState());
        useWorkspace.persist.clearStorage();
      },

      select: (uid) => set({ selUid: uid }),

      bindFile: (uid, handle) =>
        set((state) => ({ fileHandles: { ...state.fileHandles, [uid]: handle } })),

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
          const fileHandles = { ...state.fileHandles };
          const imageSources = { ...state.imageSources };
          delete fileHandles[uid];
          revokeImageSources(imageSources[uid]);
          delete imageSources[uid];
          if (state.selUid !== uid) return { decks, fileHandles, imageSources };
          return { decks, selUid: selectNextSurviving(decks, removedIndex), fileHandles, imageSources };
        }),

      importDeck: (deck, imageSources = {}) =>
        set((state) => {
          revokeImageSources(state.imageSources[deck.uid]);
          return {
            decks: [...state.decks, deck],
            selUid: deck.uid,
            imageSources: { ...state.imageSources, [deck.uid]: imageSources },
          };
        }),

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

      // Card expansion is view state, not deck content: flip it without
      // bumping editRevision so viewing a card never resets an in-progress
      // test-draw session (editRevision's sole consumer, via RightPane).
      toggleCardExpanded: (deckUid, cid) =>
        set((state) => {
          const decks = state.decks.map((d) => {
            if (d.uid !== deckUid) return d;
            const draft = structuredClone(d);
            const card = draft.cards.find((c) => c.cid === cid);
            if (card) card.expanded = !card.expanded;
            return draft;
          });
          return { decks };
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
