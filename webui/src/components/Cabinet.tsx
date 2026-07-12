// ABOUTME: Left rail "THE CABINET": deck list with unique/total badges,
// ABOUTME: selection, delete-with-confirm, deck creation, and the .yaml
// ABOUTME: import button/drop target (the handler is wired in a later task).

import { useRef } from 'react';
import type { Deck } from '../model/types';
import { useWorkspace } from '../model/store';

function deckCounts(deck: Deck): string {
  const total = deck.cards.reduce((sum, c) => sum + Math.max(1, parseInt(c.count, 10) || 1), 0);
  return `${deck.cards.length}/${total}`;
}

export interface CabinetProps {
  onImportFile?: (file: File) => void;
}

export function Cabinet({ onImportFile }: CabinetProps) {
  const decks = useWorkspace((s) => s.decks);
  const selUid = useWorkspace((s) => s.selUid);
  const select = useWorkspace((s) => s.select);
  const addDeck = useWorkspace((s) => s.addDeck);
  const deleteDeck = useWorkspace((s) => s.deleteDeck);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDelete(e: React.MouseEvent, deck: Deck) {
    e.stopPropagation();
    const name = deck.name || 'untitled deck';
    if (!window.confirm(`Delete “${name}”? This can't be undone.`)) return;
    deleteDeck(deck.uid);
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onImportFile?.(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onImportFile?.(file);
  }

  return (
    <div className="pane-cabinet" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <div className="cabinet-header">THE CABINET</div>
      <div className="cabinet-body">
        {decks.map((deck) => (
          <div
            key={deck.uid}
            className={deck.uid === selUid ? 'cabinet-row cabinet-row--selected' : 'cabinet-row'}
            onClick={() => select(deck.uid)}
          >
            <span className="cabinet-row-name">{deck.name || 'untitled deck'}</span>
            <span className="cabinet-row-count">{deckCounts(deck)}</span>
            <button
              type="button"
              className="cabinet-row-delete"
              aria-label={`Delete ${deck.name || 'untitled deck'}`}
              onClick={(e) => handleDelete(e, deck)}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="cabinet-btn" onClick={addDeck}>
          + new deck
        </button>
        <button type="button" className="cabinet-btn" onClick={() => fileInputRef.current?.click()}>
          ⤴ import .yaml
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          hidden
          data-testid="cabinet-import-input"
          onChange={handleFileChosen}
        />
      </div>
    </div>
  );
}
