// ABOUTME: "DRAW THE CARDS" test-draw panel — builds an ephemeral engine
// ABOUTME: session lazily on first Draw/Peek/Shuffle, then draws, peeks, and
// ABOUTME: shuffles against it. The session and accumulated output reset on
// ABOUTME: Reset and whenever the deck's identity or edits change.

import { useEffect, useState } from 'react';
import type { SessionState } from '../engine/engine';
import { useEngine } from '../engine/useEngine';
import { cardImageSrc } from '../logic/cardImage';
import { emitDeck } from '../logic/emit';
import { randomSeed } from '../logic/helpers';
import type { Deck } from '../model/types';
import { CardArt } from './CardArt';

interface OutputRow {
  title: string;
  instanceId: string;
  text: string;
  peek: boolean;
  imageSrc: string | null;
  alt: string;
}

interface PileChip {
  name: string;
  count: number;
}

function cardInstanceCount(card: Deck['cards'][number]): number {
  return Math.max(1, parseInt(card.count, 10) || 1);
}

function idStem(instanceId: string): string {
  return instanceId.replace(/:\d+$/, '');
}

function cardFor(deck: Deck, instanceId: string) {
  return deck.cards.find((c) => c.id === idStem(instanceId));
}

// Top-of-deck-first display: draw/peek return chunks pile-ascending (the
// engine takes the tail of the pile via split_off, preserving order), so
// the last element of a chunk is the top of the deck.
function toDisplayRows(instanceIds: string[], deck: Deck, peek: boolean): OutputRow[] {
  return instanceIds
    .slice()
    .reverse()
    .map((instanceId) => {
      const card = cardFor(deck, instanceId);
      const cardTitle = card?.title || idStem(instanceId);
      return {
        title: peek ? `peek — ${cardTitle}` : cardTitle,
        instanceId,
        text: card?.text ?? '',
        peek,
        imageSrc: card ? cardImageSrc(card, peek ? 'back' : 'front') : null,
        alt: cardTitle,
      };
    });
}

function pileChips(deck: Deck, session: SessionState | null): PileChip[] {
  if (session) {
    const names = Object.keys(session.containers);
    names.sort((a, b) => (a === 'draw_pile' ? -1 : b === 'draw_pile' ? 1 : a < b ? -1 : 1));
    return names.map((name) => ({ name, count: session.containers[name].length }));
  }
  const total = deck.cards.reduce((sum, c) => sum + cardInstanceCount(c), 0);
  const containerNames = Array.from(
    new Set(deck.containers.map((c) => c.trim()).filter((c) => c && c !== 'draw_pile')),
  ).sort();
  return [{ name: 'draw_pile', count: total }, ...containerNames.map((name) => ({ name, count: 0 }))];
}

export interface TestDrawProps {
  deck: Deck;
  editRevision: number;
  invalid: boolean;
}

export function TestDraw({ deck, editRevision, invalid }: TestDrawProps) {
  const engine = useEngine();
  const [session, setSession] = useState<SessionState | null>(null);
  const [outRows, setOutRows] = useState<OutputRow[]>([]);
  const [drawN, setDrawN] = useState('1');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(null);
    setOutRows([]);
    setError(null);
  }, [editRevision]);

  function ensureSession(): SessionState {
    if (session) return session;
    const built = engine.newSession(emitDeck(deck));
    setSession(built);
    return built;
  }

  function requestedN(): number {
    return Math.max(1, parseInt(drawN, 10) || 1);
  }

  function guarded(action: () => void) {
    try {
      action();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDraw() {
    guarded(() => {
      const sess = ensureSession();
      const pile = sess.containers.draw_pile;
      if (!pile.length) return;
      const n = Math.min(requestedN(), pile.length);
      const result = engine.draw(sess, n);
      setSession(result.session);
      setOutRows((prev) => [...prev, ...toDisplayRows(result.drawn, deck, false)]);
    });
  }

  function handlePeek() {
    guarded(() => {
      const sess = ensureSession();
      const pile = sess.containers.draw_pile;
      if (!pile.length) return;
      const n = Math.min(requestedN(), pile.length);
      const peeked = engine.peek(sess, n);
      setOutRows((prev) => [...prev, ...toDisplayRows(peeked, deck, true)]);
    });
  }

  function handleShuffle() {
    guarded(() => {
      const sess = ensureSession();
      setSession(engine.shuffle(sess, randomSeed()));
    });
  }

  function handleReset() {
    setSession(null);
    setOutRows([]);
    setError(null);
  }

  const pileEmpty = !!session && session.containers.draw_pile.length === 0;
  const chips = pileChips(deck, session);

  return (
    <>
      <div className="right-pane-section right-pane-section--spaced">
        <div className="right-pane-heading">DRAW THE CARDS</div>
        <div className="right-pane-subtitle">ephemeral session</div>
      </div>
      <div className="testdraw-bar">
        <button
          type="button"
          className="testdraw-btn testdraw-btn--gold"
          onClick={handleDraw}
          disabled={pileEmpty || invalid}
        >
          ⤴ Draw
        </button>
        <input
          className="testdraw-n"
          type="number"
          min={1}
          step={1}
          value={drawN}
          onChange={(e) => setDrawN(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <button type="button" className="testdraw-btn" onClick={handlePeek} disabled={invalid}>
          ◉ Peek
        </button>
        <button type="button" className="testdraw-btn" onClick={handleShuffle} disabled={invalid}>
          ⇄ Shuffle
        </button>
        <button type="button" className="testdraw-btn" onClick={handleReset}>
          ↺ Reset
        </button>
      </div>
      {invalid && <div className="testdraw-hint">fix validation problems to test-draw</div>}
      {!invalid && pileEmpty && <div className="testdraw-hint">pile empty — reset to draw again</div>}
      <div className="testdraw-chips">
        {chips.map((c) => (
          <span className="testdraw-chip" key={c.name} data-testid={`pile-chip-${c.name}`}>
            {c.name} <b>{c.count}</b>
          </span>
        ))}
      </div>
      <div className="testdraw-output">
        {error && (
          <div className="testdraw-output-error" data-testid="output-error">
            {error}
          </div>
        )}
        {outRows.length === 0 ? (
          <div className="testdraw-output-placeholder">— draw from the pile to reveal cards —</div>
        ) : (
          outRows.map((row, i) => (
            <div className="testdraw-card" key={i} data-testid="output-row">
              <div className="testdraw-card-head">
                <span
                  className={
                    row.peek ? 'testdraw-card-title testdraw-card-title--peek' : 'testdraw-card-title'
                  }
                >
                  {row.title}
                </span>
                <span className="testdraw-card-iid">{row.instanceId}</span>
              </div>
              {row.imageSrc && <CardArt src={row.imageSrc} alt={row.alt} />}
              <div className="testdraw-card-text">{row.text}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
