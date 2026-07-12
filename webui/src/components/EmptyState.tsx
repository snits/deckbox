// ABOUTME: Center-pane placeholder for when no deck is selected — two
// ABOUTME: variants: an existing-decks prompt to pick one, and a first-run
// ABOUTME: prompt to create or import when the cabinet is empty.

export interface EmptyStateProps {
  hasDecks: boolean;
}

export function EmptyState({ hasDecks }: EmptyStateProps) {
  const title = hasDecks ? 'Nothing selected' : 'The cabinet is empty';
  const body = hasDecks
    ? 'Choose a deck from the cabinet to edit it.'
    : 'Create a new deck or import an existing .yaml definition to begin.';

  return (
    <div className="empty-state">
      <div className="empty-state-cardback" aria-hidden="true">
        ☾
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-body">{body}</div>
    </div>
  );
}
