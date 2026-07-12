// @vitest-environment node
// ABOUTME: Golden tests against the real wasm engine: semantic round-trip
// ABOUTME: through parse -> model -> emit -> parse, and validity parity between
// ABOUTME: validateDeckModel and engine.validateDeck across shared fixtures.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initWasm, * as rawWasm from '../src/wasm/pkg/deckbox_wasm.js';
import { wrapEngine, type Engine, type ParsedDeck, type RawEngine } from '../src/engine/engine';
import { parsedToDeck } from '../src/model/store';
import { emitDeck } from '../src/logic/emit';
import { validateDeckModel } from '../src/logic/validate';

const testsRoot = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = path.join(testsRoot, 'fixtures');

let engine: Engine;

beforeAll(async () => {
  const bytes = fs.readFileSync(path.join(testsRoot, '../src/wasm/pkg/deckbox_wasm_bg.wasm'));
  await initWasm({ module_or_path: bytes });
  engine = wrapEngine(rawWasm as unknown as RawEngine);
});

const VALID_FIXTURES = ['oracle.yaml', 'poker.yaml'];
const INVALID_FIXTURES = [
  'invalid-empty-cards.yaml',
  'invalid-duplicate-id.yaml',
  'invalid-colon-id.yaml',
  'invalid-zero-count.yaml',
  'invalid-reserved-container.yaml',
];

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

function parseOrThrow(src: string): ParsedDeck {
  const result = engine.parseDeck(src);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.error}`);
  return result.deck;
}

/** Collapses the engine's "unset" encodings (null) onto the editor round-trip's
 * "default" encodings, so a value written by the engine's own default and a
 * value written back out by the emitter compare equal. */
function normalizeParsedDeck(deck: ParsedDeck): ParsedDeck {
  return {
    ...deck,
    containers: deck.containers ?? [],
    cards: deck.cards.map((c) => ({
      ...c,
      count: c.count ?? 1,
      metadata: c.metadata ?? null,
    })),
  };
}

describe('normalizeParsedDeck', () => {
  const base: ParsedDeck = {
    name: 'D',
    description: null,
    containers: null,
    cards: [{ id: 'a', title: null, text: 'A', count: null, metadata: null }],
  };

  it('treats a null count as equal to an explicit count of 1', () => {
    const explicit: ParsedDeck = { ...base, cards: [{ ...base.cards[0], count: 1 }] };
    expect(base).not.toEqual(explicit);
    expect(normalizeParsedDeck(base)).toEqual(normalizeParsedDeck(explicit));
  });

  it('treats null containers as equal to an empty containers array', () => {
    const explicit: ParsedDeck = { ...base, containers: [] };
    expect(base).not.toEqual(explicit);
    expect(normalizeParsedDeck(base)).toEqual(normalizeParsedDeck(explicit));
  });

  it('treats a missing metadata key as equal to an explicit null', () => {
    const { metadata: _metadata, ...cardWithoutMetadata } = base.cards[0];
    const absent = { ...base, cards: [cardWithoutMetadata as ParsedDeck['cards'][0]] };
    expect(normalizeParsedDeck(absent)).toEqual(normalizeParsedDeck(base));
  });
});

describe('golden round-trip (real wasm)', () => {
  for (const fixture of VALID_FIXTURES) {
    it(`${fixture}: parse -> model -> emit -> parse is semantically unchanged`, () => {
      const src = readFixture(fixture);
      const first = parseOrThrow(src);
      const emitted = emitDeck(parsedToDeck(first));
      const second = parseOrThrow(emitted);
      expect(normalizeParsedDeck(second)).toEqual(normalizeParsedDeck(first));
    });
  }
});

describe('validity parity between TS and engine (real wasm)', () => {
  for (const fixture of [...VALID_FIXTURES, ...INVALID_FIXTURES]) {
    it(`${fixture}: validateDeckModel and engine.validateDeck agree`, () => {
      const src = readFixture(fixture);
      const tsValid = validateDeckModel(parsedToDeck(parseOrThrow(src))).length === 0;
      const engineValid = engine.validateDeck(src).valid;
      expect(tsValid).toBe(engineValid);
    });
  }
});

describe('clean-emitter proof', () => {
  it('emits examples/oracle.yaml with no null tokens and no count: 1 line', () => {
    const emitted = emitDeck(parsedToDeck(parseOrThrow(readFixture('oracle.yaml'))));
    expect(emitted).not.toMatch(/\bnull\b/);
    expect(emitted).not.toMatch(/^\s*count: 1\s*$/m);
  });
});
