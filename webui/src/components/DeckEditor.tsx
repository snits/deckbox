// ABOUTME: Center pane deck editor — name/description fields, the CONTAINERS
// ABOUTME: list, and the filterable, reorderable, collapsible CARDS list.
// ABOUTME: Per-field error state is derived from validateDeckModel's output,
// ABOUTME: the same problems list the header's status pill reads.

import { useRef, useState } from 'react';
import { CardRow } from './CardRow';
import { newUid } from '../logic/helpers';
import { validateDeckModel } from '../logic/validate';
import { blankCard, useWorkspace } from '../model/store';
import type { Card, Deck, Problem } from '../model/types';

interface CardIssues {
  idError: boolean;
  textError: boolean;
  copiesError: boolean;
  metaKeyErrors: Set<string>;
}

// Reads validateDeckModel's structured problems back into per-card/per-field
// flags — the same rules the header pill counts, not a second validation
// pass. Matching is by cardIndices/field, not message text, so a problem
// tied to one card (e.g. a metadata duplicate) never bleeds onto another
// card that merely shares that card's id.
function deriveCardIssues(deck: Deck, problems: Problem[]): CardIssues[] {
  return deck.cards.map((card, i) => {
    const cardProblems = problems.filter((p) => p.cardIndices?.includes(i));
    const idError = cardProblems.some((p) => p.field === 'id');
    const textError = cardProblems.some((p) => p.field === 'text');
    const copiesError = cardProblems.some((p) => p.field === 'count');
    const metaKeyErrors = new Set(
      card.meta
        .filter((row) => cardProblems.some((p) => p.field === 'meta' && p.metaKey === row.key))
        .map((row) => row.rid),
    );
    return { idError, textError, copiesError, metaKeyErrors };
  });
}

function cardTotal(deck: Deck): number {
  return deck.cards.reduce((sum, c) => sum + Math.max(1, parseInt(c.count, 10) || 1), 0);
}

function containerInputClass(name: string): string {
  const base = 'field-input field-input--mono';
  return name.trim() === 'draw_pile' ? `${base} field-input--bad` : base;
}

export function DeckEditor() {
  const decks = useWorkspace((s) => s.decks);
  const selUid = useWorkspace((s) => s.selUid);
  const updateDeck = useWorkspace((s) => s.updateDeck);
  const toggleCardExpanded = useWorkspace((s) => s.toggleCardExpanded);
  const deck = decks.find((d) => d.uid === selUid);
  const [filter, setFilter] = useState('');
  const dragCid = useRef<string | null>(null);

  if (!deck) return null;

  const mutate = (fn: (d: Deck) => void) => updateDeck(deck.uid, fn);
  const issues = deriveCardIssues(deck, validateDeckModel(deck));

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleIndices = deck.cards
    .map((_, i) => i)
    .filter((i) => {
      if (!normalizedFilter) return true;
      const c = deck.cards[i];
      return `${c.id} ${c.title} ${c.text}`.toLowerCase().includes(normalizedFilter);
    });

  return (
    <div className="editor-wrap">
      <div className="field">
        <div className="field-label">Deck name</div>
        <input
          className="field-input field-input--big"
          value={deck.name}
          onChange={(e) => mutate((d) => { d.name = e.target.value; })}
          placeholder="Fate Oracle"
        />
      </div>
      <div className="field field--spaced">
        <div className="field-label">
          Description <span className="field-label-opt">— optional</span>
        </div>
        <input
          className="field-input"
          value={deck.description}
          onChange={(e) => mutate((d) => { d.description = e.target.value; })}
          placeholder="Draw to reveal what fate has in store"
        />
      </div>

      <div className="editor-section">
        <div className="editor-section-title">CONTAINERS</div>
        <div className="editor-section-note">draw_pile is implicit — list extra piles like discard</div>
        <div className="editor-section-spacer" />
        <button type="button" className="editor-btn" onClick={() => mutate((d) => { d.containers.push(''); })}>
          + add
        </button>
      </div>
      {deck.containers.map((container, i) => (
        <div className="container-row" key={i} data-testid={`container-row-${i}`}>
          <input
            className={containerInputClass(container)}
            value={container}
            onChange={(e) => mutate((d) => { d.containers[i] = e.target.value; })}
            placeholder="discard"
          />
          <button
            type="button"
            className="container-remove"
            onClick={() => mutate((d) => { d.containers.splice(i, 1); })}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="editor-section">
        <div className="editor-section-title">CARDS</div>
        <div className="editor-section-note">
          {deck.cards.length} unique · {cardTotal(deck)} total instances
        </div>
        <div className="editor-section-spacer" />
        <input
          className="field-input field-input--mono editor-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter…"
        />
        <button type="button" className="editor-btn editor-btn--gold" onClick={() => mutate((d) => { d.cards.push(blankCard()); })}>
          + card
        </button>
      </div>
      {visibleIndices.map((i, pos) => {
        const card = deck.cards[i];
        // Full-array neighbors can be filtered out, so ▲/▼ swap against the
        // previous/next VISIBLE index (hopping over hidden cards in between)
        // rather than i ± 1 — otherwise a visible card silently swaps with a
        // hidden one instead of the one the user sees next to it.
        const prevVisible = pos > 0 ? visibleIndices[pos - 1] : null;
        const nextVisible = pos < visibleIndices.length - 1 ? visibleIndices[pos + 1] : null;
        return (
          <CardRow
            key={card.cid}
            card={card}
            idError={issues[i].idError}
            textError={issues[i].textError}
            copiesError={issues[i].copiesError}
            metaKeyErrors={issues[i].metaKeyErrors}
            canMoveUp={prevVisible !== null}
            canMoveDown={nextVisible !== null}
            onMutate={(fn) => mutate((d) => fn(d.cards[i]))}
            onToggleExpand={() => toggleCardExpanded(deck.uid, card.cid)}
            onMoveUp={() =>
              mutate((d) => {
                if (prevVisible === null) return;
                const cs = d.cards;
                [cs[prevVisible], cs[i]] = [cs[i], cs[prevVisible]];
              })
            }
            onMoveDown={() =>
              mutate((d) => {
                if (nextVisible === null) return;
                const cs = d.cards;
                [cs[i], cs[nextVisible]] = [cs[nextVisible], cs[i]];
              })
            }
            onDuplicate={() =>
              mutate((d) => {
                const original = d.cards[i];
                const copy: Card = structuredClone(original);
                copy.cid = newUid();
                copy.id = copy.id ? `${copy.id}-copy` : '';
                copy.expanded = true;
                copy.meta = copy.meta.map((m) => ({ ...m, rid: newUid() }));
                d.cards.splice(i + 1, 0, copy);
              })
            }
            onRemove={() => mutate((d) => { d.cards.splice(i, 1); })}
            onDragStart={() => { dragCid.current = card.cid; }}
            onDrop={() => {
              const src = dragCid.current;
              if (!src || src === card.cid) return;
              mutate((d) => {
                const cs = d.cards;
                const si = cs.findIndex((x) => x.cid === src);
                const ti = cs.findIndex((x) => x.cid === card.cid);
                if (si < 0 || ti < 0) return;
                const moved = cs.splice(si, 1)[0];
                cs.splice(ti, 0, moved);
              });
            }}
          />
        );
      })}
    </div>
  );
}
