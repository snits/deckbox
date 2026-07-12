// ABOUTME: Engine bridge between the webui and deckbox-wasm — JSON parsing
// ABOUTME: and snake_case-to-camelCase mapping over the raw wasm module surface.

export interface ParsedCard {
  id: string;
  title: string | null;
  text: string;
  count: number | null;
  metadata: Record<string, string> | null;
}

export interface ParsedDeck {
  name: string;
  description: string | null;
  containers: string[] | null;
  cards: ParsedCard[];
}

export type ParseResult =
  | { ok: true; deck: ParsedDeck; sawComments: boolean; droppedKeys: string[] }
  | { ok: false; error: string };

export interface SessionState {
  name: string;
  definition_path: string;
  containers: Record<string, string[]>;
  definition_cards: string[];
}

/** The raw wasm module surface (snake_case, JSON-string I/O). */
export interface RawEngine {
  parse_deck(yaml: string): string;
  validate_deck(yaml: string): string;
  new_session(yaml: string): string;
  draw(session_json: string, count: number): string;
  peek(session_json: string, count: number): string;
  shuffle(session_json: string, seed: number): string;
}

export interface Engine {
  parseDeck(yaml: string): ParseResult;
  validateDeck(yaml: string): { valid: boolean; error?: string };
  newSession(yaml: string): SessionState;
  draw(session: SessionState, count: number): { session: SessionState; drawn: string[] };
  peek(session: SessionState, count: number): string[];
  shuffle(session: SessionState, seed: number): SessionState;
}

/** Wraps a raw JSON-string engine (the wasm module, or a test double) with
 * envelope parsing and snake_case-to-camelCase mapping. Kept separate from
 * `initEngine` so this is testable without loading WASM. */
export function wrapEngine(raw: RawEngine): Engine {
  return {
    parseDeck(yaml) {
      const parsed = JSON.parse(raw.parse_deck(yaml)) as
        | { ok: true; deck: ParsedDeck; saw_comments: boolean; dropped_keys: string[] }
        | { ok: false; error: string };
      if (!parsed.ok) return parsed;
      return {
        ok: true,
        deck: parsed.deck,
        sawComments: parsed.saw_comments,
        droppedKeys: parsed.dropped_keys,
      };
    },

    validateDeck(yaml) {
      return JSON.parse(raw.validate_deck(yaml)) as { valid: boolean; error?: string };
    },

    newSession(yaml) {
      const parsed = JSON.parse(raw.new_session(yaml)) as SessionState | { error: string };
      if ('error' in parsed) throw new Error(parsed.error);
      return parsed;
    },

    draw(session, count) {
      const parsed = JSON.parse(raw.draw(JSON.stringify(session), count)) as
        | { session: SessionState; drawn: string[] }
        | { error: string };
      if ('error' in parsed) throw new Error(parsed.error);
      return parsed;
    },

    peek(session, count) {
      const parsed = JSON.parse(raw.peek(JSON.stringify(session), count)) as
        | { cards: string[] }
        | { error: string };
      if ('error' in parsed) throw new Error(parsed.error);
      return parsed.cards;
    },

    shuffle(session, seed) {
      const parsed = JSON.parse(raw.shuffle(JSON.stringify(session), seed)) as
        | SessionState
        | { error: string };
      if ('error' in parsed) throw new Error(parsed.error);
      return parsed;
    },
  };
}

export async function initEngine(): Promise<Engine> {
  const wasm = await import('../wasm/pkg/deckbox_wasm.js');
  await wasm.default();
  return wrapEngine(wasm);
}
