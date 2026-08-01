// ABOUTME: Full-list (not fail-fast) validation over the editor model: the five
// ABOUTME: engine rules (bare message strings) plus editor-only checks, suffixed.

import type { Deck, Problem } from '../model/types';

export function validateDeckModel(deck: Deck): Problem[] {
  const problems: Problem[] = [];
  const push = (message: string, extra: Omit<Problem, 'message'> = {}) =>
    problems.push({ message, ...extra });

  if (!deck.cards.length) push('deck has empty cards list');

  const indicesById: Record<string, number[]> = {};
  deck.cards.forEach((card, i) => {
    if (card.id) (indicesById[card.id] ??= []).push(i);
  });

  deck.cards.forEach((card, i) => {
    const label = card.id || `card #${i + 1}`;
    // One problem per duplicated id (not one per extra copy), listing every
    // sharing card, pushed at the group's first index so it lands once.
    const dupIndices = card.id ? indicesById[card.id] : undefined;
    if (dupIndices && dupIndices.length > 1 && dupIndices[0] === i) {
      push(`duplicate card ID: ${card.id}`, { cardIndices: dupIndices, field: 'id' });
    }
    if (card.id.includes(':')) {
      push(`card ID '${card.id}' contains a colon, which conflicts with instance ID format`, {
        cardIndices: [i],
        field: 'id',
      });
    }
    if (parseInt(card.count, 10) === 0) {
      push(`card '${label}' has count of 0`, { cardIndices: [i], field: 'count' });
    }
    if (!card.id.trim()) {
      push(`card #${i + 1} has an empty id (editor check)`, { cardIndices: [i], field: 'id' });
    }
    if (!card.text.trim()) {
      push(`card '${label}' has empty text (editor check)`, { cardIndices: [i], field: 'text' });
    }

    const seenMetaKeys: Record<string, boolean> = {};
    for (const row of card.meta) {
      if (row.key.trim() && seenMetaKeys[row.key]) {
        push(`card '${label}' has duplicate metadata key: ${row.key} (editor check)`, {
          cardIndices: [i],
          field: 'meta',
          metaKey: row.key,
        });
      }
      seenMetaKeys[row.key] = true;
    }
  });

  for (const container of deck.containers) {
    if (container.trim() === 'draw_pile') push("container name 'draw_pile' is reserved");
  }

  return problems;
}
