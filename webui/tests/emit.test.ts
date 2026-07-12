// ABOUTME: Tests for the clean YAML emitter (yv scalar quoting, emitDeck field
// ABOUTME: omission/ordering) — byte-exact against the Global Constraints spec.

import { describe, expect, it } from 'vitest';
import { emitDeck, yv } from '../src/logic/emit';
import type { Card, Deck } from '../src/model/types';

function mkCard(overrides: Partial<Card> = {}): Card {
  return { cid: 'c1', id: 'goblin', title: '', text: 'A goblin.', count: '1', meta: [], expanded: false, ...overrides };
}

function mkDeck(overrides: Partial<Deck> = {}): Deck {
  return { uid: 'u1', name: 'Test Deck', description: '', containers: [], cards: [mkCard()], ...overrides };
}

describe('yv', () => {
  const cases: Array<[string, string]> = [
    ['plain', 'plain'],
    ['', '""'],
    [' leading', '" leading"'],
    ['trailing ', '"trailing "'],
    ['-leading dash', '"-leading dash"'],
    ['?leading question', '"?leading question"'],
    [':leading colon', '":leading colon"'],
    [',leading comma', '",leading comma"'],
    ['[leading bracket', '"[leading bracket"'],
    [']leading bracket', '"]leading bracket"'],
    ['{leading brace', '"{leading brace"'],
    ['}leading brace', '"}leading brace"'],
    ['#leading hash', '"#leading hash"'],
    ['&leading amp', '"&leading amp"'],
    ['*leading star', '"*leading star"'],
    ['!leading bang', '"!leading bang"'],
    ['|leading pipe', '"|leading pipe"'],
    ['>leading gt', '">leading gt"'],
    ["'leading quote", "\"'leading quote\""],
    ['"leading dquote', '"\\"leading dquote"'],
    ['%leading pct', '"%leading pct"'],
    ['@leading at', '"@leading at"'],
    ['`leading backtick', '"`leading backtick"'],
    ['has: colon', '"has: colon"'],
    ['has #hash', '"has #hash"'],
    ['true', '"true"'],
    ['FALSE', '"FALSE"'],
    ['Yes', '"Yes"'],
    ['no', '"no"'],
    ['On', '"On"'],
    ['off', '"off"'],
    ['null', '"null"'],
    ['~', '"~"'],
    ['12', '"12"'],
    ['-3.5', '"-3.5"'],
    ['.5', '".5"'],
    ['not-numeric-1d6', 'not-numeric-1d6'],
  ];

  for (const [input, expected] of cases) {
    it(`renders ${JSON.stringify(input)} as ${expected}`, () => {
      expect(yv(input)).toBe(expected);
    });
  }

  it('escapes backslashes and embedded quotes when quoting is triggered', () => {
    expect(yv('has "quotes" and \\ backslash: yes')).toBe('"has \\"quotes\\" and \\\\ backslash: yes"');
  });

  it('quotes and escapes embedded newlines', () => {
    expect(yv('line one\nline two')).toBe('"line one\\nline two"');
  });

  it('quotes and escapes embedded carriage returns', () => {
    expect(yv('line one\r\nline two')).toBe('"line one\\r\\nline two"');
  });

  it('escapes backslashes before newlines so the two don\'t interact', () => {
    expect(yv('back\\slash\nnext line')).toBe('"back\\\\slash\\nnext line"');
  });
});

describe('emitDeck', () => {
  it('omits description, containers, title, metadata when unset/empty, and count when 1', () => {
    const deck = mkDeck();
    expect(emitDeck(deck)).toBe(
      `name: Test Deck

cards:
  - id: goblin
    text: A goblin.
`,
    );
  });

  it('emits description and containers when present', () => {
    const deck = mkDeck({ description: 'A test deck.', containers: ['discard'] });
    expect(emitDeck(deck)).toBe(
      `name: Test Deck
description: A test deck.
containers:
  - discard

cards:
  - id: goblin
    text: A goblin.
`,
    );
  });

  it('emits count when it is not 1', () => {
    const deck = mkDeck({ cards: [mkCard({ count: '3' })] });
    expect(emitDeck(deck)).toBe(
      `name: Test Deck

cards:
  - id: goblin
    text: A goblin.
    count: 3
`,
    );
  });

  it('emits title when present, in id/title/text/count/metadata key order', () => {
    const deck = mkDeck({
      cards: [
        mkCard({
          title: 'Goblin Ambush',
          count: '3',
          meta: [{ rid: 'm1', key: 'category', value: 'exploration' }],
        }),
      ],
    });
    expect(emitDeck(deck)).toBe(
      `name: Test Deck

cards:
  - id: goblin
    title: Goblin Ambush
    text: A goblin.
    count: 3
    metadata:
      category: exploration
`,
    );
  });

  it('emits metadata rows in editor insertion order', () => {
    const deck = mkDeck({
      cards: [
        mkCard({
          meta: [
            { rid: 'm1', key: 'image', value: 'goblin.png' },
            { rid: 'm2', key: 'category', value: 'combat' },
          ],
        }),
      ],
    });
    expect(emitDeck(deck)).toBe(
      `name: Test Deck

cards:
  - id: goblin
    text: A goblin.
    metadata:
      image: goblin.png
      category: combat
`,
    );
  });

  it('drops metadata rows with empty keys', () => {
    const deck = mkDeck({
      cards: [
        mkCard({
          meta: [
            { rid: 'm1', key: '', value: 'orphaned' },
            { rid: 'm2', key: 'category', value: 'combat' },
          ],
        }),
      ],
    });
    expect(emitDeck(deck)).toBe(
      `name: Test Deck

cards:
  - id: goblin
    text: A goblin.
    metadata:
      category: combat
`,
    );
  });

  it('omits metadata block entirely when only empty-key rows remain', () => {
    const deck = mkDeck({
      cards: [mkCard({ meta: [{ rid: 'm1', key: '', value: 'orphaned' }] })],
    });
    expect(emitDeck(deck)).toBe(
      `name: Test Deck

cards:
  - id: goblin
    text: A goblin.
`,
    );
  });

  it('filters blank container rows', () => {
    const deck = mkDeck({ containers: ['discard', '', '  '] });
    expect(emitDeck(deck)).toBe(
      `name: Test Deck
containers:
  - discard

cards:
  - id: goblin
    text: A goblin.
`,
    );
  });

  it('quotes name/description/id/title/text scalars that need quoting', () => {
    const deck = mkDeck({
      name: 'yes',
      description: 'has: colon',
      cards: [mkCard({ id: '-bad', title: 'true', text: '12' })],
    });
    expect(emitDeck(deck)).toBe(
      `name: "yes"
description: "has: colon"

cards:
  - id: "-bad"
    title: "true"
    text: "12"
`,
    );
  });
});
