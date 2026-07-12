// ABOUTME: Full-list (not fail-fast) validation over the editor model: the five
// ABOUTME: engine rules (bare message strings) plus editor-only checks, suffixed.

import type { Deck, Problem } from '../model/types';

export function validateDeckModel(deck: Deck): Problem[] {
  const problems: Problem[] = [];
  const push = (message: string) => problems.push({ message });

  if (!deck.cards.length) push('deck has empty cards list');

  const seenIds: Record<string, boolean> = {};
  deck.cards.forEach((card, i) => {
    const label = card.id || `card #${i + 1}`;
    if (card.id && seenIds[card.id]) push(`duplicate card ID: ${card.id}`);
    seenIds[card.id] = true;
    if (card.id.includes(':')) {
      push(`card ID '${card.id}' contains a colon, which conflicts with instance ID format`);
    }
    if (parseInt(card.count, 10) === 0) push(`card '${label}' has count of 0`);
    if (!card.id.trim()) push(`card #${i + 1} has an empty id (editor check)`);
    if (!card.text.trim()) push(`card '${label}' has empty text (editor check)`);

    const seenMetaKeys: Record<string, boolean> = {};
    for (const row of card.meta) {
      if (row.key.trim() && seenMetaKeys[row.key]) {
        push(`card '${label}' has duplicate metadata key: ${row.key} (editor check)`);
      }
      seenMetaKeys[row.key] = true;
    }
  });

  for (const container of deck.containers) {
    if (container.trim() === 'draw_pile') push("container name 'draw_pile' is reserved");
  }

  return problems;
}
