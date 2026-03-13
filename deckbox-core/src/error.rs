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
    fn validation_error_display() {
        let err = DeckboxError::ValidationError("duplicate card ID: goblin".into());
        assert!(err.to_string().contains("duplicate card ID: goblin"));
    }
}
