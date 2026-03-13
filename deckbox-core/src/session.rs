// ABOUTME: Session state for a deck in play.
// ABOUTME: Tracks card instance locations across named containers.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

use crate::definition::DeckDefinition;

pub type InstanceId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub name: String,
    pub definition_path: PathBuf,
    pub containers: HashMap<String, Vec<InstanceId>>,
    pub definition_cards: Vec<String>,
}

impl Session {
    /// Create a session from a deck definition. All instance cards go into draw_pile.
    /// If shuffle is true, the draw_pile is shuffled after creation.
    pub fn new(name: &str, definition_path: PathBuf, definition: &DeckDefinition, shuffle: bool) -> Self {
        let mut instances = Vec::new();
        let mut definition_cards = Vec::new();

        for card in &definition.cards {
            definition_cards.push(card.id.clone());
            let count = card.count();
            for n in 1..=count {
                instances.push(format!("{}:{}", card.id, n));
            }
        }

        if shuffle {
            use rand::seq::SliceRandom;
            let mut rng = rand::thread_rng();
            instances.shuffle(&mut rng);
        }

        let mut containers = HashMap::new();
        containers.insert("draw_pile".to_string(), instances);

        // Create any containers declared in the definition
        if let Some(container_names) = &definition.containers {
            for name in container_names {
                containers.insert(name.clone(), Vec::new());
            }
        }

        Session {
            name: name.to_string(),
            definition_path,
            containers,
            definition_cards,
        }
    }

    /// Extract the definition ID from an instance ID by stripping the `:N` suffix.
    pub fn definition_id(instance_id: &str) -> Option<&str> {
        instance_id.rsplit_once(':').map(|(def_id, _)| def_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::definition::DeckDefinition;

    const TEST_YAML: &str = r#"
name: "Test Deck"
containers:
  - discard
cards:
  - id: alpha
    text: "Alpha card"
    count: 2
  - id: beta
    text: "Beta card"
"#;

    use std::path::PathBuf;

    fn make_session(yaml: &str) -> Session {
        let def = DeckDefinition::from_yaml(yaml).unwrap();
        Session::new("test-session", PathBuf::from("/test/deck.yaml"), &def, false)
    }

    #[test]
    fn create_session_places_all_cards_in_draw_pile() {
        let session = make_session(TEST_YAML);
        let draw_pile = session.containers.get("draw_pile").unwrap();
        assert_eq!(draw_pile.len(), 3); // 2 alpha + 1 beta
    }

    #[test]
    fn instance_ids_follow_format() {
        let session = make_session(TEST_YAML);
        let draw_pile = session.containers.get("draw_pile").unwrap();
        assert!(draw_pile.contains(&"alpha:1".to_string()));
        assert!(draw_pile.contains(&"alpha:2".to_string()));
        assert!(draw_pile.contains(&"beta:1".to_string()));
    }

    #[test]
    fn session_creates_definition_containers() {
        let session = make_session(TEST_YAML);
        assert!(session.containers.contains_key("discard"));
        assert!(session.containers.get("discard").unwrap().is_empty());
    }

    #[test]
    fn session_stores_definition_card_ids() {
        let session = make_session(TEST_YAML);
        assert_eq!(session.definition_cards, vec!["alpha", "beta"]);
    }

    #[test]
    fn session_stores_definition_path() {
        let session = make_session(TEST_YAML);
        assert_eq!(session.definition_path, PathBuf::from("/test/deck.yaml"));
    }

    #[test]
    fn session_name_stored() {
        let def = DeckDefinition::from_yaml(TEST_YAML).unwrap();
        let session = Session::new("my-game", PathBuf::from("/test/deck.yaml"), &def, false);
        assert_eq!(session.name, "my-game");
    }

    #[test]
    fn definition_id_strips_suffix() {
        assert_eq!(Session::definition_id("goblin-ambush:2"), Some("goblin-ambush"));
        assert_eq!(Session::definition_id("alpha:1"), Some("alpha"));
    }

    #[test]
    fn definition_id_returns_none_for_invalid() {
        assert_eq!(Session::definition_id("no-suffix"), None);
    }
}
