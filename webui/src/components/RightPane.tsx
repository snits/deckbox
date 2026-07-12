// ABOUTME: Right pane — live YAML viewer with copy/download, the validation
// ABOUTME: list (mirrors validateDeckModel), and the test-draw panel. Shows a
// ABOUTME: placeholder in place of validation/test-draw when no deck is selected.

import { useState } from 'react';
import { emitDeck } from '../logic/emit';
import { downloadText, slug } from '../logic/helpers';
import { validateDeckModel } from '../logic/validate';
import { useWorkspace } from '../model/store';
import { TestDraw } from './TestDraw';

const COPY_LABEL = '⧉ copy';
const COPIED_LABEL = '✓ copied';
const COPY_RESET_MS = 1400;

export function RightPane() {
  const decks = useWorkspace((s) => s.decks);
  const selUid = useWorkspace((s) => s.selUid);
  const editRevision = useWorkspace((s) => s.editRevision);
  const deck = decks.find((d) => d.uid === selUid) ?? null;
  const [copyLabel, setCopyLabel] = useState(COPY_LABEL);

  const yaml = deck ? emitDeck(deck) : '# no deck selected';
  const title = deck ? `${slug(deck.name)}.YAML` : 'YAML';
  const problems = deck ? validateDeckModel(deck) : [];

  function handleCopy() {
    if (!deck) return;
    navigator.clipboard?.writeText(yaml);
    setCopyLabel(COPIED_LABEL);
    setTimeout(() => setCopyLabel(COPY_LABEL), COPY_RESET_MS);
  }

  function handleDownload() {
    if (!deck) return;
    downloadText(`${slug(deck.name)}.yaml`, yaml);
  }

  return (
    <>
      <div className="right-pane-section">
        <div className="right-pane-heading">{title}</div>
        {deck && (
          <div className="right-pane-yaml-actions">
            <button type="button" className="right-pane-btn" onClick={handleCopy}>
              {copyLabel}
            </button>
            <button type="button" className="right-pane-btn" onClick={handleDownload}>
              ⬇ .yaml
            </button>
          </div>
        )}
      </div>
      <div className="right-pane-yaml">
        <pre data-testid="yaml-box">{yaml}</pre>
      </div>
      {!deck && (
        <div className="right-pane-placeholder">— select a deck to validate and test-draw —</div>
      )}
      {deck && (
        <div className="right-pane-body">
          <div className="right-pane-section right-pane-section--spaced">
            <div className="right-pane-heading">VALIDATION</div>
            <div className="right-pane-subtitle">deckbox rules + editor checks</div>
          </div>
          <div className="right-pane-validation" data-testid="validation-list">
            {problems.length === 0 ? (
              <div className="right-pane-validation-row right-pane-validation-row--ok">
                ✓ Deck is valid.
              </div>
            ) : (
              problems.map((p, i) => (
                <div className="right-pane-validation-row right-pane-validation-row--err" key={i}>
                  ✕ {p.message}
                </div>
              ))
            )}
          </div>
          <TestDraw
            key={deck.uid}
            deck={deck}
            editRevision={editRevision}
            invalid={problems.length > 0}
          />
        </div>
      )}
    </>
  );
}
