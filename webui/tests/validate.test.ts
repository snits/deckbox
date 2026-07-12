// ABOUTME: Tests for validateDeckModel — the five engine rules (bare message
// ABOUTME: strings) plus the three editor-only checks (suffixed "(editor check)").

import { describe, expect, it } from 'vitest';
import { validateDeckModel } from '../src/logic/validate';
import type { Card, Deck } from '../src/model/types';

function mkCard(overrides: Partial<Card> = {}): Card {
  return { cid: 'c1', id: 'goblin', title: '', text: 'A goblin.', count: '1', meta: [], expanded: false, ...overrides };
}

function mkDeck(overrides: Partial<Deck> = {}): Deck {
  return { uid: 'u1', name: 'Test Deck', description: '', containers: [], cards: [mkCard()], ...overrides };
}

function messages(deck: Deck): string[] {
  return validateDeckModel(deck).map((p) => p.message);
}

describe('valid deck', () => {
  it('produces no problems', () => {
    expect(validateDeckModel(mkDeck())).toEqual([]);
  });
});

describe('engine rules', () => {
  it('flags an empty cards list', () => {
    expect(messages(mkDeck({ cards: [] }))).toContain('deck has empty cards list');
  });

  it('flags a duplicate card ID', () => {
    const deck = mkDeck({
      cards: [mkCard({ cid: 'c1', id: 'goblin' }), mkCard({ cid: 'c2', id: 'goblin' })],
    });
    expect(messages(deck)).toContain('duplicate card ID: goblin');
  });

  it('flags a card ID containing a colon', () => {
    const deck = mkDeck({ cards: [mkCard({ id: 'goblin:1' })] });
    expect(messages(deck)).toContain(
      "card ID 'goblin:1' contains a colon, which conflicts with instance ID format",
    );
  });

  it('flags a card with count of 0', () => {
    const deck = mkDeck({ cards: [mkCard({ id: 'goblin', count: '0' })] });
    expect(messages(deck)).toContain("card 'goblin' has count of 0");
  });

  it('flags a reserved container name', () => {
    const deck = mkDeck({ containers: ['draw_pile'] });
    expect(messages(deck)).toContain("container name 'draw_pile' is reserved");
  });
});

describe('editor checks', () => {
  it('flags an empty card id', () => {
    const deck = mkDeck({ cards: [mkCard({ id: '' })] });
    expect(messages(deck)).toContain('card #1 has an empty id (editor check)');
  });

  it('flags empty card text', () => {
    const deck = mkDeck({ cards: [mkCard({ id: 'goblin', text: '' })] });
    expect(messages(deck)).toContain("card 'goblin' has empty text (editor check)");
  });

  it('flags a duplicate metadata key on a card', () => {
    const deck = mkDeck({
      cards: [
        mkCard({
          id: 'goblin',
          meta: [
            { rid: 'm1', key: 'category', value: 'combat' },
            { rid: 'm2', key: 'category', value: 'again' },
          ],
        }),
      ],
    });
    expect(messages(deck)).toContain("card 'goblin' has duplicate metadata key: category (editor check)");
  });

  it('does not flag a metadata row with an empty key as a duplicate', () => {
    const deck = mkDeck({
      cards: [
        mkCard({
          id: 'goblin',
          meta: [
            { rid: 'm1', key: '', value: 'a' },
            { rid: 'm2', key: '', value: 'b' },
          ],
        }),
      ],
    });
    expect(messages(deck).some((m) => m.includes('duplicate metadata key'))).toBe(false);
  });
});

describe('multiple problems', () => {
  it('reports every rule violation, not just the first', () => {
    const deck = mkDeck({
      containers: ['draw_pile'],
      cards: [mkCard({ id: '', text: '', count: '0' })],
    });
    const probs = messages(deck);
    expect(probs).toContain("container name 'draw_pile' is reserved");
    expect(probs).toContain('card #1 has an empty id (editor check)');
    expect(probs).toContain("card 'card #1' has empty text (editor check)");
    expect(probs).toContain("card 'card #1' has count of 0");
    expect(probs.length).toBeGreaterThan(1);
  });
});
