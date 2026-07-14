// ABOUTME: Left rail "THE CABINET": deck list with unique/total badges,
// ABOUTME: selection, delete-with-confirm, deck creation, and the .yaml
// ABOUTME: import button/drop target — imports through the engine and shows
// ABOUTME: a failure or comments/dropped-keys banner above the deck list.

import { useRef, useState } from 'react';
import { useOptionalEngine } from '../engine/useEngine';
import { importFailureMessage, importYaml } from '../import/importDeck';
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
  const startNewWorkspace = useWorkspace((s) => s.startNewWorkspace);
  const deleteDeck = useWorkspace((s) => s.deleteDeck);
  const importDeck = useWorkspace((s) => s.importDeck);
  const fileHandles = useWorkspace((s) => s.fileHandles);
  const engine = useOptionalEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  function handleDelete(e: React.MouseEvent, deck: Deck) {
    e.stopPropagation();
    const name = deck.name || 'untitled deck';
    const handle = fileHandles[deck.uid];
    const boundNote = handle ? ` (saved as “${handle.name}”)` : '';
    const message =
      `Remove “${name}” from the cabinet? This only clears it from Deck Forge —` +
      ` it never deletes a saved .yaml from your disk.${boundNote}`;
    if (!window.confirm(message)) return;
    deleteDeck(deck.uid);
  }

  function handleStartNewWorkspace() {
    if (
      !window.confirm(
        'Start a new workspace? Unsaved Deck Forge work will be lost. Saved YAML files on disk are untouched.',
      )
    ) {
      return;
    }
    startNewWorkspace();
  }

  function importFile(file: File) {
    onImportFile?.(file);
    // Cabinet is mounted unconditionally, so it can't gate this hook call on
    // a deck being selected the way TestDraw does; null only happens in test
    // scaffolding rendered without an EngineProvider — production always
    // supplies a ready engine.
    if (!engine) return;
    const reader = new FileReader();
    reader.onload = () => {
      const outcome = importYaml(engine, file.name, String(reader.result ?? ''));
      if (outcome.ok) {
        importDeck(outcome.deck);
        setImportError(null);
        setImportNotice(outcome.notice);
      } else {
        setImportError(outcome.error);
        setImportNotice(null);
      }
    };
    reader.onerror = () => {
      setImportError(importFailureMessage(file.name, reader.error?.message || 'file could not be read'));
      setImportNotice(null);
    };
    reader.readAsText(file);
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) importFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) importFile(file);
  }

  return (
    <div className="pane-cabinet" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <div className="cabinet-header">THE CABINET</div>
      {importError && (
        <div className="cabinet-banner cabinet-banner--err" data-testid="import-error-banner">
          <span className="cabinet-banner-text">{importError}</span>
          <button type="button" className="cabinet-banner-dismiss" onClick={() => setImportError(null)}>
            ✕
          </button>
        </div>
      )}
      {importNotice && (
        <div className="cabinet-banner cabinet-banner--note" data-testid="import-notice-banner">
          <span className="cabinet-banner-text">{importNotice}</span>
          <button type="button" className="cabinet-banner-dismiss" onClick={() => setImportNotice(null)}>
            ✕
          </button>
        </div>
      )}
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
        {decks.length > 0 && (
          <button type="button" className="cabinet-btn" onClick={handleStartNewWorkspace}>
            ↺ start new workspace
          </button>
        )}
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
