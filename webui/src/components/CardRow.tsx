// ABOUTME: A single card in the CARDS list — the "signature element": an
// ABOUTME: ivory card face that's a collapsed summary row (id/preview/copies)
// ABOUTME: or, expanded, the full id/title/copies/text/metadata edit form.

import { newUid } from '../logic/helpers';
import type { Card } from '../model/types';

export interface CardRowProps {
  card: Card;
  idError: boolean;
  textError: boolean;
  copiesError: boolean;
  metaKeyErrors: Set<string>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMutate(fn: (card: Card) => void): void;
  onMoveUp(): void;
  onMoveDown(): void;
  onDuplicate(): void;
  onRemove(): void;
  onDragStart(): void;
  onDrop(): void;
}

function fieldInputClass(base: string, bad: boolean): string {
  return bad ? `${base} field-input--bad` : base;
}

export function CardRow({
  card,
  idError,
  textError,
  copiesError,
  metaKeyErrors,
  canMoveUp,
  canMoveDown,
  onMutate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onDragStart,
  onDrop,
}: CardRowProps) {
  const copies = Math.max(1, parseInt(card.count, 10) || 1);
  const bad = idError || textError;

  function toggle() {
    onMutate((c) => {
      c.expanded = !c.expanded;
    });
  }

  function stopAnd(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      fn();
    };
  }

  function addMeta() {
    onMutate((c) => {
      c.meta.push({ rid: newUid(), key: '', value: '' });
    });
  }

  function setMetaField(rid: string, field: 'key' | 'value', value: string) {
    onMutate((c) => {
      const row = c.meta.find((m) => m.rid === rid);
      if (row) row[field] = value;
    });
  }

  function removeMeta(rid: string) {
    onMutate((c) => {
      c.meta = c.meta.filter((m) => m.rid !== rid);
    });
  }

  function handleRemove() {
    if (!window.confirm(`Remove card “${card.id || '(no id)'}”?`)) return;
    onRemove();
  }

  return (
    <div
      className={bad ? 'card-row card-row--bad' : 'card-row'}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      data-testid={`card-row-${card.cid}`}
    >
      <div className="card-row-header" onClick={toggle}>
        <span className="card-row-handle" title="Drag to reorder">
          ☰
        </span>
        <div className="card-row-updown">
          <button type="button" title="Move up" disabled={!canMoveUp} onClick={stopAnd(onMoveUp)}>
            ▲
          </button>
          <button
            type="button"
            title="Move down"
            disabled={!canMoveDown}
            onClick={stopAnd(onMoveDown)}
          >
            ▼
          </button>
        </div>
        <span
          className={idError ? 'card-row-id card-row-id--error' : 'card-row-id'}
          data-testid="card-id-chip"
        >
          {card.id.trim() || '(no id)'}
        </span>
        <span className="card-row-preview">{card.title || card.text || '—'}</span>
        {copies > 1 && (
          <span className="card-row-copies" data-testid="card-copies-pill">
            {copies} copies
          </span>
        )}
      </div>
      {card.expanded && (
        <div className="card-row-body">
          <div className="card-fields-grid">
            <div>
              <div className="card-field-label">id</div>
              <input
                className={fieldInputClass('card-field-input card-field-input--mono', idError)}
                value={card.id}
                onChange={(e) => onMutate((c) => { c.id = e.target.value; })}
                placeholder="goblin-ambush"
              />
            </div>
            <div>
              <div className="card-field-label">
                Title <span className="card-field-label-opt">— optional</span>
              </div>
              <input
                className="card-field-input"
                value={card.title}
                onChange={(e) => onMutate((c) => { c.title = e.target.value; })}
                placeholder="Goblin Ambush"
              />
            </div>
            <div>
              <div className="card-field-label">Copies</div>
              <input
                className={fieldInputClass('card-field-input card-field-input--mono', copiesError)}
                type="number"
                min={1}
                step={1}
                value={card.count}
                onChange={(e) =>
                  onMutate((c) => { c.count = e.target.value.replace(/[^0-9]/g, ''); })
                }
              />
            </div>
          </div>
          <div>
            <div className="card-field-label">Text</div>
            <textarea
              className={fieldInputClass('card-field-input', textError)}
              rows={2}
              value={card.text}
              onChange={(e) => onMutate((c) => { c.text = e.target.value; })}
              placeholder="A band of goblins leaps from the bushes!"
            />
          </div>
          <div>
            <div className="card-field-label">
              Metadata <span className="card-field-label-opt">— key / value</span>
            </div>
            {card.meta.map((row) => (
              <div className="card-meta-row" key={row.rid} data-testid={`meta-row-${row.rid}`}>
                <input
                  className={fieldInputClass(
                    'card-field-input card-field-input--mono',
                    metaKeyErrors.has(row.rid),
                  )}
                  value={row.key}
                  onChange={(e) => setMetaField(row.rid, 'key', e.target.value)}
                  placeholder="category"
                />
                <input
                  className="card-field-input card-field-input--mono"
                  value={row.value}
                  onChange={(e) => setMetaField(row.rid, 'value', e.target.value)}
                  placeholder="exploration"
                />
                <button type="button" className="card-meta-remove" onClick={() => removeMeta(row.rid)}>
                  ✕
                </button>
              </div>
            ))}
            <div className="card-row-footer">
              <button type="button" className="card-btn" onClick={addMeta}>
                + metadata
              </button>
              <div className="card-row-footer-spacer" />
              <button type="button" className="card-btn" onClick={onDuplicate}>
                ⧉ duplicate
              </button>
              <button type="button" className="card-btn card-btn--danger" onClick={handleRemove}>
                ✕ remove card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
