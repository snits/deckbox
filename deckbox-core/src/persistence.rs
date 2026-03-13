// ABOUTME: Serialize and deserialize session state.
// ABOUTME: Uses Read/Write traits so callers control storage location.

use std::io::{Read, Write};
use crate::error::{DeckboxError, Result};
use crate::session::Session;
use crate::definition::DeckDefinition;
use crate::Warning;

/// Serialize session state to a writer.
pub fn save_session<W: Write>(session: &Session, writer: &mut W) -> Result<()> {
    serde_yaml::to_writer(writer, session)
        .map_err(|e| DeckboxError::ParseError(e.to_string()))
}

/// Deserialize session state from a reader. Compares definition card IDs
/// to detect mismatches, returning warnings alongside the session.
pub fn load_session<R: Read>(
    reader: R,
    definition: &DeckDefinition,
) -> Result<(Session, Vec<Warning>)> {
    let session: Session = serde_yaml::from_reader(reader)
        .map_err(|e| DeckboxError::ParseError(e.to_string()))?;

    let mut warnings = Vec::new();

    let current_ids: Vec<String> = definition.cards.iter().map(|c| c.id.clone()).collect();
    let stored_ids = &session.definition_cards;

    let added: Vec<String> = current_ids
        .iter()
        .filter(|id| !stored_ids.contains(id))
        .cloned()
        .collect();

    let removed: Vec<String> = stored_ids
        .iter()
        .filter(|id| !current_ids.contains(id))
        .cloned()
        .collect();

    if !added.is_empty() || !removed.is_empty() {
        warnings.push(Warning::DefinitionMismatch { added, removed });
    }

    Ok((session, warnings))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::definition::DeckDefinition;
    use crate::session::Session;

    const TEST_YAML: &str = r#"
name: "Test"
cards:
  - id: alpha
    text: "Alpha"
    count: 2
  - id: beta
    text: "Beta"
"#;

    #[test]
    fn save_load_round_trip() {
        let def = DeckDefinition::from_yaml(TEST_YAML).unwrap();
        let session = Session::new("test", std::path::PathBuf::from("/test/deck.yaml"), &def, false);

        let mut buf = Vec::new();
        save_session(&session, &mut buf).unwrap();

        let (loaded, warnings) = load_session(&buf[..], &def).unwrap();
        assert_eq!(loaded.name, "test");
        assert_eq!(loaded.containers["draw_pile"].len(), 3);
        assert!(warnings.is_empty());
    }

    #[test]
    fn load_detects_added_cards() {
        let def = DeckDefinition::from_yaml(TEST_YAML).unwrap();
        let session = Session::new("test", std::path::PathBuf::from("/test/deck.yaml"), &def, false);

        let mut buf = Vec::new();
        save_session(&session, &mut buf).unwrap();

        let new_yaml = r#"
name: "Test"
cards:
  - id: alpha
    text: "Alpha"
    count: 2
  - id: beta
    text: "Beta"
  - id: gamma
    text: "Gamma"
"#;
        let new_def = DeckDefinition::from_yaml(new_yaml).unwrap();
        let (_, warnings) = load_session(&buf[..], &new_def).unwrap();
        assert_eq!(warnings.len(), 1);
        match &warnings[0] {
            Warning::DefinitionMismatch { added, removed } => {
                assert!(added.contains(&"gamma".to_string()));
                assert!(removed.is_empty());
            }
        }
    }

    #[test]
    fn load_detects_removed_cards() {
        let def = DeckDefinition::from_yaml(TEST_YAML).unwrap();
        let session = Session::new("test", std::path::PathBuf::from("/test/deck.yaml"), &def, false);

        let mut buf = Vec::new();
        save_session(&session, &mut buf).unwrap();

        let new_yaml = r#"
name: "Test"
cards:
  - id: alpha
    text: "Alpha"
    count: 2
"#;
        let new_def = DeckDefinition::from_yaml(new_yaml).unwrap();
        let (_, warnings) = load_session(&buf[..], &new_def).unwrap();
        assert_eq!(warnings.len(), 1);
        match &warnings[0] {
            Warning::DefinitionMismatch { added, removed } => {
                assert!(added.is_empty());
                assert!(removed.contains(&"beta".to_string()));
            }
        }
    }
}
