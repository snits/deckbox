// ABOUTME: Serialize and deserialize session state.
// ABOUTME: Uses Read/Write traits so callers control storage location.

use std::collections::HashSet;
use std::io::{Read, Write};
use crate::error::{DeckboxError, Result};
use crate::session::Session;
use crate::definition::DeckDefinition;
use crate::Warning;

/// Serialize session state to a writer.
pub fn save_session<W: Write>(session: &Session, writer: &mut W) -> Result<()> {
    serde_yaml::to_writer(writer, session)
        .map_err(|e| DeckboxError::YamlError(e.to_string()))
}

/// Deserialize session state from a reader.
pub fn load_session<R: Read>(reader: R) -> Result<Session> {
    serde_yaml::from_reader(reader)
        .map_err(|e| DeckboxError::YamlError(e.to_string()))
}

/// Compare session's stored card IDs against a definition, returning
/// warnings for any added or removed cards.
pub fn check_definition_mismatch(
    session: &Session,
    definition: &DeckDefinition,
) -> Vec<Warning> {
    let mut warnings = Vec::new();

    let current_ids: HashSet<&String> = definition.cards.iter().map(|c| &c.id).collect();
    let stored_ids: HashSet<&String> = session.definition_cards.iter().collect();

    let added: Vec<String> = current_ids.difference(&stored_ids).map(|s| s.to_string()).collect();
    let removed: Vec<String> = stored_ids.difference(&current_ids).map(|s| s.to_string()).collect();

    if !added.is_empty() || !removed.is_empty() {
        warnings.push(Warning::DefinitionMismatch { added, removed });
    }

    warnings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::definition::DeckDefinition;
    use crate::session::Session;

    const TEST_YAML: &str = r#"
name: "Test"
containers:
  - discard
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

        let loaded = load_session(&buf[..]).unwrap();
        let warnings = check_definition_mismatch(&loaded, &def);
        assert!(warnings.is_empty());

        // Verify all fields survive round-trip
        assert_eq!(loaded.name, session.name);
        assert_eq!(loaded.definition_path, session.definition_path);
        assert_eq!(loaded.definition_cards, session.definition_cards);

        // Verify all containers and their contents (including order)
        assert_eq!(loaded.containers.len(), session.containers.len());
        assert_eq!(loaded.containers["draw_pile"], session.containers["draw_pile"]);
        assert!(loaded.containers.contains_key("discard"));
        assert!(loaded.containers["discard"].is_empty());
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
        let session = load_session(&buf[..]).unwrap();
        let warnings = check_definition_mismatch(&session, &new_def);
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
        let session = load_session(&buf[..]).unwrap();
        let warnings = check_definition_mismatch(&session, &new_def);
        assert_eq!(warnings.len(), 1);
        match &warnings[0] {
            Warning::DefinitionMismatch { added, removed } => {
                assert!(added.is_empty());
                assert!(removed.contains(&"beta".to_string()));
            }
        }
    }
}
