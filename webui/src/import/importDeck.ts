// ABOUTME: Maps an engine parseDeck result to the outcome the Cabinet import
// ABOUTME: flow renders — a deck ready to add, or the failure banner text.

import type { Engine } from '../engine/engine';
import { parsedToDeck } from '../model/store';
import type { Deck } from '../model/types';

export type ImportOutcome =
  | { ok: true; deck: Deck; notice: string | null }
  | { ok: false; error: string };

export function importYaml(engine: Engine, fileName: string, text: string): ImportOutcome {
  const parsed = engine.parseDeck(text);
  if (!parsed.ok) {
    return { ok: false, error: `Couldn’t import ${fileName}: ${parsed.error}` };
  }

  const deck = parsedToDeck(parsed.deck);
  const notes: string[] = [];
  if (parsed.sawComments) notes.push('comments in the source file won’t be kept');
  if (parsed.droppedKeys.length) notes.push(`unrecognized keys dropped: ${parsed.droppedKeys.join(', ')}`);
  const notice = notes.length ? `Imported “${deck.name}” — ${notes.join('; ')}.` : null;

  return { ok: true, deck, notice };
}
