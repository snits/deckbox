// ABOUTME: App header: brand block, the selected deck's name, and a live
// ABOUTME: validity status pill sourced from validateDeckModel.

import { validateDeckModel } from '../logic/validate';
import { useWorkspace } from '../model/store';

export function Header() {
  const decks = useWorkspace((s) => s.decks);
  const selUid = useWorkspace((s) => s.selUid);
  const deck = decks.find((d) => d.uid === selUid) ?? null;
  const problems = deck ? validateDeckModel(deck) : [];
  const valid = problems.length === 0;
  const statusLabel = valid
    ? 'Deck is valid'
    : `${problems.length} problem${problems.length === 1 ? '' : 's'}`;

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-brand-name">Deckbox</div>
        <div className="header-brand-tag">DECK FORGE</div>
      </div>
      <div className="header-divider" />
      {deck && (
        <div className="header-deck">
          <span className="header-deck-label">Deck</span>
          <span className="header-deck-name" data-testid="header-deck-name">
            {deck.name}
          </span>
        </div>
      )}
      <div className="header-spacer" />
      {deck && (
        <div
          className={valid ? 'header-status header-status--valid' : 'header-status header-status--invalid'}
          data-testid="header-status"
        >
          <span className="header-status-dot" />
          <span className="header-status-text">{statusLabel}</span>
        </div>
      )}
    </header>
  );
}
