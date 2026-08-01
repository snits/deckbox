// ABOUTME: Editor-facing domain types for Deck Forge — the shape the store,
// ABOUTME: emitter, and validator operate on, distinct from the engine's ParsedDeck.

export interface MetaRow {
  rid: string;
  key: string;
  value: string;
}

export interface Card {
  cid: string;
  id: string;
  title: string;
  text: string;
  count: string;
  meta: MetaRow[];
  expanded: boolean;
}

export interface Deck {
  uid: string;
  name: string;
  description: string;
  containers: string[];
  cards: Card[];
}

export type ProblemField = 'id' | 'text' | 'count' | 'meta';

export interface Problem {
  message: string;
  /** Indices of cards this problem applies to (omitted for deck-level problems). */
  cardIndices?: number[];
  field?: ProblemField;
  /** Present when field === 'meta': the metadata key the problem concerns. */
  metaKey?: string;
}
