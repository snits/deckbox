// ABOUTME: Right pane — live YAML viewer with copy/download, the validation
// ABOUTME: list (mirrors validateDeckModel), and the test-draw panel. Shows a
// ABOUTME: placeholder in place of validation/test-draw when no deck is selected.

import { useState } from 'react';
import { emitDeck } from '../logic/emit';
import { canPickFiles, pickAndWrite, writeExisting } from '../logic/fileSave';
import { downloadText, slug } from '../logic/helpers';
import { validateDeckModel } from '../logic/validate';
import { useWorkspace } from '../model/store';
import { TestDraw } from './TestDraw';

const COPY_LABEL = '⧉ copy';
const COPIED_LABEL = '✓ copied';
const COPY_RESET_MS = 1400;
const SAVE_LABEL = 'Save';
const SAVED_LABEL = '✓ saved';
const SAVE_ERROR_LABEL = '✕ save failed';

export function RightPane() {
  const decks = useWorkspace((s) => s.decks);
  const selUid = useWorkspace((s) => s.selUid);
  const editRevision = useWorkspace((s) => s.editRevision);
  const deck = decks.find((d) => d.uid === selUid) ?? null;
  const [copyLabel, setCopyLabel] = useState(COPY_LABEL);
  const fileHandles = useWorkspace((s) => s.fileHandles);
  const bindFile = useWorkspace((s) => s.bindFile);
  const handle = deck ? fileHandles[deck.uid] : undefined;
  const [saveLabel, setSaveLabel] = useState(SAVE_LABEL);

  const yaml = deck ? emitDeck(deck) : '# no deck selected';
  const title = deck ? `${slug(deck.name)}.YAML` : 'YAML';
  const problems = deck ? validateDeckModel(deck) : [];

  function handleCopy() {
    if (!deck) return;
    navigator.clipboard
      ?.writeText(yaml)
      .then(() => {
        setCopyLabel(COPIED_LABEL);
        setTimeout(() => setCopyLabel(COPY_LABEL), COPY_RESET_MS);
      })
      // The write failed (denied permission, no secure context, …) — leave
      // the label at COPY_LABEL rather than claiming success.
      .catch(() => {});
  }

  function flashSave(label: string) {
    setSaveLabel(label);
    setTimeout(() => setSaveLabel(SAVE_LABEL), COPY_RESET_MS);
  }

  async function handleSave() {
    if (!deck) return;
    const filename = `${slug(deck.name)}.yaml`;
    if (!canPickFiles()) {
      downloadText(filename, yaml);
      flashSave(SAVED_LABEL);
      return;
    }
    try {
      if (handle && (await writeExisting(handle, yaml))) {
        flashSave(SAVED_LABEL);
        return;
      }
      // No handle yet, or permission was lost — fall through to picking a file.
      const picked = await pickAndWrite(filename, yaml);
      if (picked) {
        bindFile(deck.uid, picked);
        flashSave(SAVED_LABEL);
      }
    } catch {
      flashSave(SAVE_ERROR_LABEL);
    }
  }

  async function handleSaveAs() {
    if (!deck) return;
    try {
      const picked = await pickAndWrite(`${slug(deck.name)}.yaml`, yaml);
      if (picked) {
        bindFile(deck.uid, picked);
        flashSave(SAVED_LABEL);
      }
    } catch {
      flashSave(SAVE_ERROR_LABEL);
    }
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
            <button type="button" className="right-pane-btn" onClick={handleSave}>
              {saveLabel}
            </button>
            {canPickFiles() && (
              <button type="button" className="right-pane-btn" onClick={handleSaveAs}>
                Save as…
              </button>
            )}
          </div>
        )}
        {deck && handle && <div className="right-pane-subtitle">saved to {handle.name}</div>}
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
