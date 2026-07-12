// ABOUTME: Clean YAML emitter for the editor model — NOT the engine serializer.
// ABOUTME: Omits unset/default fields so a round-trip through the engine parser is lossless.

import type { Deck } from '../model/types';

const NEEDS_QUOTE_KEYWORDS = /^(true|false|yes|no|on|off|null|~)$/i;
const NEEDS_QUOTE_NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const NEEDS_QUOTE_LEADING = /^[-?:,[\]{}#&*!|>'"%@`]/;

export function yv(s: string): string {
  const needsQuote =
    s === '' ||
    /^\s|\s$/.test(s) ||
    NEEDS_QUOTE_LEADING.test(s) ||
    /:(\s|$)/.test(s) ||
    s.includes(' #') ||
    s.includes('\n') ||
    s.includes('\r') ||
    NEEDS_QUOTE_KEYWORDS.test(s) ||
    NEEDS_QUOTE_NUMERIC.test(s);
  if (!needsQuote) return s;
  return `"${s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`;
}

export function emitDeck(deck: Deck): string {
  const lines: string[] = [];
  lines.push(`name: ${yv(deck.name)}`);
  if (deck.description) lines.push(`description: ${yv(deck.description)}`);
  const containers = deck.containers.filter((c) => c.trim() !== '');
  if (containers.length) {
    lines.push('containers:');
    for (const c of containers) lines.push(`  - ${yv(c)}`);
  }
  lines.push('');
  lines.push('cards:');
  for (const card of deck.cards) {
    lines.push(`  - id: ${yv(card.id)}`);
    if (card.title) lines.push(`    title: ${yv(card.title)}`);
    lines.push(`    text: ${yv(card.text)}`);
    const count = parseInt(card.count, 10);
    if (!Number.isNaN(count) && count !== 1) lines.push(`    count: ${count}`);
    const meta = card.meta.filter((m) => m.key.trim() !== '');
    if (meta.length) {
      lines.push('    metadata:');
      for (const m of meta) lines.push(`      ${yv(m.key)}: ${yv(m.value)}`);
    }
  }
  return lines.join('\n') + '\n';
}
