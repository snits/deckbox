// ABOUTME: Error types for deckbox-core operations.
// ABOUTME: Covers container, card, session, definition, and validation errors.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum DeckboxError {
    #[error("container not found: {0}")]
    ContainerNotFound(String),

    #[error("card not found: {0}")]
    CardNotFound(String),

    #[error("container is empty: {0}")]
    ContainerEmpty(String),

    #[error("not enough cards in {container}: requested {requested}, available {available}")]
    NotEnoughCards {
        container: String,
        requested: usize,
        available: usize,
    },

    #[error("session not found: {0}")]
    SessionNotFound(String),

    #[error("duplicate session: {0}")]
    DuplicateSession(String),

    #[error("validation error: {0}")]
    ValidationError(String),

    #[error("yaml error: {0}")]
    YamlError(String),
}

pub type Result<T> = std::result::Result<T, DeckboxError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn container_not_found_display() {
        let err = DeckboxError::ContainerNotFound("hand".into());
        assert!(err.to_string().contains("hand"));
    }

    #[test]
    fn card_not_found_display() {
        let err = DeckboxError::CardNotFound("ace:1".into());
        assert!(err.to_string().contains("ace:1"));
    }

    #[test]
    fn container_empty_display() {
        let err = DeckboxError::ContainerEmpty("hand".into());
        assert!(err.to_string().contains("hand"));
    }

    #[test]
    fn session_not_found_display() {
        let err = DeckboxError::SessionNotFound("game1".into());
        assert!(err.to_string().contains("game1"));
    }

    #[test]
    fn duplicate_session_display() {
        let err = DeckboxError::DuplicateSession("game1".into());
        assert!(err.to_string().contains("game1"));
    }

    #[test]
    fn not_enough_cards_display() {
        let err = DeckboxError::NotEnoughCards {
            container: "draw_pile".into(),
            requested: 5,
            available: 2,
        };
        let msg = err.to_string();
        assert!(msg.contains("draw_pile"));
        assert!(msg.contains("5"));
        assert!(msg.contains("2"));
    }

    #[test]
    fn yaml_error_display() {
        let err = DeckboxError::YamlError("bad input".into());
        assert!(err.to_string().contains("bad input"));
    }

    #[test]
    fn validation_error_display() {
        let err = DeckboxError::ValidationError("duplicate card ID: goblin".into());
        assert!(err.to_string().contains("duplicate card ID: goblin"));
    }
}
