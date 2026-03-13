// ABOUTME: Deck and card definitions parsed from YAML files.
// ABOUTME: Handles validation of card IDs, counts, and container names.

use serde::Deserialize;
use std::collections::HashMap;
use crate::error::{DeckboxError, Result};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CardDef {
    pub id: String,
    pub text: String,
    pub count: Option<u32>,
    pub metadata: Option<HashMap<String, String>>,
}

impl CardDef {
    /// Returns the number of copies of this card (defaults to 1).
    pub fn count(&self) -> u32 {
        self.count.unwrap_or(1)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct DeckDefinition {
    pub name: String,
    pub description: Option<String>,
    pub cards: Vec<CardDef>,
    pub containers: Option<Vec<String>>,
}

impl DeckDefinition {
    /// Parse a deck definition from a YAML string.
    pub fn from_yaml(yaml: &str) -> Result<Self> {
        let def: DeckDefinition = serde_yaml::from_str(yaml)
            .map_err(|e| DeckboxError::ParseError(e.to_string()))?;
        def.validate()?;
        Ok(def)
    }

    /// Validate structural rules: no duplicate IDs, no zero counts, no reserved container names.
    fn validate(&self) -> Result<()> {
        let mut seen_ids = std::collections::HashSet::new();
        for card in &self.cards {
            if !seen_ids.insert(&card.id) {
                return Err(DeckboxError::ValidationError(
                    format!("duplicate card ID: {}", card.id),
                ));
            }
            if card.count == Some(0) {
                return Err(DeckboxError::ValidationError(
                    format!("card '{}' has count of 0", card.id),
                ));
            }
        }
        if let Some(containers) = &self.containers {
            for name in containers {
                if name == "draw_pile" {
                    return Err(DeckboxError::ValidationError(
                        "container name 'draw_pile' is reserved".into(),
                    ));
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL_YAML: &str = r#"
name: "Test Deck"
cards:
  - id: card-one
    text: "First card"
"#;

    const FULL_YAML: &str = r#"
name: "Fate Oracle"
description: "Draw to reveal what fate has in store"
containers:
  - discard
cards:
  - id: goblin-ambush
    text: "A band of goblins leaps from the bushes!"
    count: 3
  - id: dragon-sighting
    text: "A shadow passes overhead..."
  - id: ancient-ruins
    text: "You stumble upon crumbling stone walls..."
    metadata:
      category: exploration
      image: ancient-ruins.png
"#;

    #[test]
    fn parse_minimal_definition() {
        let def = DeckDefinition::from_yaml(MINIMAL_YAML).unwrap();
        assert_eq!(def.name, "Test Deck");
        assert_eq!(def.cards.len(), 1);
        assert_eq!(def.cards[0].id, "card-one");
        assert_eq!(def.cards[0].text, "First card");
        assert_eq!(def.cards[0].count(), 1);
        assert!(def.cards[0].metadata.is_none());
        assert!(def.description.is_none());
        assert!(def.containers.is_none());
    }

    #[test]
    fn parse_full_definition() {
        let def = DeckDefinition::from_yaml(FULL_YAML).unwrap();
        assert_eq!(def.name, "Fate Oracle");
        assert_eq!(def.description.as_deref(), Some("Draw to reveal what fate has in store"));
        assert_eq!(def.cards.len(), 3);
        assert_eq!(def.cards[0].count(), 3);
        assert_eq!(def.cards[1].count(), 1);
        let meta = def.cards[2].metadata.as_ref().unwrap();
        assert_eq!(meta.get("category").unwrap(), "exploration");
        assert_eq!(def.containers.as_ref().unwrap(), &vec!["discard".to_string()]);
    }

    #[test]
    fn reject_duplicate_card_ids() {
        let yaml = r#"
name: "Bad Deck"
cards:
  - id: dupe
    text: "First"
  - id: dupe
    text: "Second"
"#;
        let err = DeckDefinition::from_yaml(yaml).unwrap_err();
        assert!(matches!(err, DeckboxError::ValidationError(_)));
        assert!(err.to_string().contains("duplicate card ID: dupe"));
    }

    #[test]
    fn reject_zero_count() {
        let yaml = r#"
name: "Bad Deck"
cards:
  - id: ghost
    text: "I don't exist"
    count: 0
"#;
        let err = DeckDefinition::from_yaml(yaml).unwrap_err();
        assert!(matches!(err, DeckboxError::ValidationError(_)));
        assert!(err.to_string().contains("count of 0"));
    }

    #[test]
    fn reject_reserved_container_name() {
        let yaml = r#"
name: "Bad Deck"
containers:
  - draw_pile
cards:
  - id: card
    text: "A card"
"#;
        let err = DeckDefinition::from_yaml(yaml).unwrap_err();
        assert!(matches!(err, DeckboxError::ValidationError(_)));
        assert!(err.to_string().contains("draw_pile"));
    }

    #[test]
    fn reject_malformed_yaml() {
        let err = DeckDefinition::from_yaml("not: valid: yaml: [").unwrap_err();
        assert!(matches!(err, DeckboxError::ParseError(_)));
    }
}
