// ABOUTME: Operations on sessions — draw, move, shuffle, peek, and queries.
// ABOUTME: All operations work on container names and instance IDs.

use std::collections::HashSet;
use rand::seq::SliceRandom;
use crate::definition::{CardDef, DeckDefinition};
use crate::error::{DeckboxError, Result};
use crate::session::{self, InstanceId, Session};

pub fn remaining(session: &Session, container: &str) -> Result<usize> {
    session.containers.get(container).map(|c| c.len())
        .ok_or_else(|| DeckboxError::ContainerNotFound(container.into()))
}

pub fn is_empty(session: &Session, container: &str) -> Result<bool> {
    remaining(session, container).map(|n| n == 0)
}

pub fn containers(session: &Session) -> Vec<(String, usize)> {
    let mut result: Vec<_> = session.containers.iter().map(|(name, cards)| (name.clone(), cards.len())).collect();
    result.sort_by(|a, b| a.0.cmp(&b.0));
    result
}

pub fn list(session: &Session, container: &str) -> Result<Vec<InstanceId>> {
    session.containers.get(container).cloned()
        .ok_or_else(|| DeckboxError::ContainerNotFound(container.into()))
}

pub fn create_container(session: &mut Session, name: &str) -> Result<()> {
    session.containers.entry(name.to_string()).or_default();
    Ok(())
}

pub fn peek(session: &Session, container: &str, count: usize) -> Result<Vec<InstanceId>> {
    if count == 0 {
        return Ok(Vec::new());
    }
    let cards = session.containers.get(container)
        .ok_or_else(|| DeckboxError::ContainerNotFound(container.into()))?;
    if cards.is_empty() {
        return Err(DeckboxError::ContainerEmpty(container.into()));
    }
    if count > cards.len() {
        return Err(DeckboxError::NotEnoughCards {
            container: container.into(), requested: count, available: cards.len(),
        });
    }
    Ok(cards[cards.len() - count..].to_vec())
}

pub fn shuffle(session: &mut Session, container: &str) -> Result<()> {
    let cards = session.containers.get_mut(container)
        .ok_or_else(|| DeckboxError::ContainerNotFound(container.into()))?;
    let mut rng = rand::thread_rng();
    cards.shuffle(&mut rng);
    Ok(())
}

pub fn draw(session: &mut Session, from: &str, to: &str, count: usize) -> Result<Vec<InstanceId>> {
    if count == 0 {
        return Ok(Vec::new());
    }
    {
        let source = session.containers.get(from)
            .ok_or_else(|| DeckboxError::ContainerNotFound(from.into()))?;
        if source.is_empty() {
            return Err(DeckboxError::ContainerEmpty(from.into()));
        }
        if count > source.len() {
            return Err(DeckboxError::NotEnoughCards {
                container: from.into(), requested: count, available: source.len(),
            });
        }
    }
    let source = session.containers.get_mut(from).unwrap();
    let split_at = source.len() - count;
    let drawn: Vec<InstanceId> = source.split_off(split_at);
    create_container(session, to)?;
    session.containers.get_mut(to).unwrap().extend_from_slice(&drawn);
    Ok(drawn)
}

pub fn move_cards(session: &mut Session, cards: &[InstanceId], from: &str, to: &str) -> Result<()> {
    if cards.is_empty() {
        return Ok(());
    }
    {
        let source = session.containers.get(from)
            .ok_or_else(|| DeckboxError::ContainerNotFound(from.into()))?;
        let card_set: HashSet<&InstanceId> = cards.iter().collect();
        for card in &card_set {
            if !source.contains(card) {
                return Err(DeckboxError::CardNotFound(format!("{} not found in {}", card, from)));
            }
        }
    }
    let card_set: HashSet<&InstanceId> = cards.iter().collect();
    let source = session.containers.get_mut(from).unwrap();
    source.retain(|c| !card_set.contains(c));
    create_container(session, to)?;
    session.containers.get_mut(to).unwrap().extend(cards.iter().cloned());
    Ok(())
}

pub fn move_all(session: &mut Session, from: &str, to: &str) -> Result<()> {
    let cards: Vec<InstanceId> = session.containers.get_mut(from)
        .ok_or_else(|| DeckboxError::ContainerNotFound(from.into()))?
        .drain(..)
        .collect();
    create_container(session, to)?;
    session.containers.get_mut(to).unwrap().extend(cards);
    Ok(())
}

pub fn find(session: &Session, instance_id: &str) -> Result<Option<String>> {
    for (name, cards) in &session.containers {
        if cards.iter().any(|c| c == instance_id) {
            return Ok(Some(name.clone()));
        }
    }
    Ok(None)
}

pub fn resolve(instance_id: &str, definition: &DeckDefinition) -> Result<CardDef> {
    let def_id = session::definition_id(instance_id).ok_or_else(|| {
        DeckboxError::CardNotFound(format!("invalid instance ID format: {}", instance_id))
    })?;
    definition.cards.iter().find(|c| c.id == def_id).cloned()
        .ok_or_else(|| DeckboxError::CardNotFound(format!("no definition for: {}", def_id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::definition::DeckDefinition;
    use crate::session::Session;

    fn test_session() -> Session {
        let yaml = r#"
name: "Test"
containers:
  - discard
cards:
  - id: a
    text: "Card A"
    count: 3
  - id: b
    text: "Card B"
    count: 2
"#;
        let def = DeckDefinition::from_yaml(yaml).unwrap();
        Session::new("test", std::path::PathBuf::from("/test/deck.yaml"), &def, false)
    }

    #[test]
    fn remaining_returns_count() {
        let session = test_session();
        assert_eq!(remaining(&session, "draw_pile").unwrap(), 5);
        assert_eq!(remaining(&session, "discard").unwrap(), 0);
    }

    #[test]
    fn remaining_unknown_container_errors() {
        let session = test_session();
        assert!(matches!(remaining(&session, "nonexistent"), Err(DeckboxError::ContainerNotFound(_))));
    }

    #[test]
    fn is_empty_check() {
        let session = test_session();
        assert!(!is_empty(&session, "draw_pile").unwrap());
        assert!(is_empty(&session, "discard").unwrap());
    }

    #[test]
    fn containers_lists_all() {
        let session = test_session();
        let cs = containers(&session);
        assert!(cs.iter().any(|(name, count)| name == "draw_pile" && *count == 5));
        assert!(cs.iter().any(|(name, count)| name == "discard" && *count == 0));
    }

    #[test]
    fn list_container_contents() {
        let session = test_session();
        let items = list(&session, "draw_pile").unwrap();
        assert_eq!(items.len(), 5);
    }

    #[test]
    fn create_container_adds_empty() {
        let mut session = test_session();
        create_container(&mut session, "hand").unwrap();
        assert!(session.containers.contains_key("hand"));
        assert!(session.containers.get("hand").unwrap().is_empty());
    }

    #[test]
    fn create_existing_container_is_noop() {
        let mut session = test_session();
        create_container(&mut session, "discard").unwrap();
        assert!(session.containers.contains_key("discard"));
    }

    #[test]
    fn peek_returns_top_cards_without_removing() {
        let session = test_session();
        let peeked = peek(&session, "draw_pile", 2).unwrap();
        assert_eq!(peeked.len(), 2);
        assert_eq!(remaining(&session, "draw_pile").unwrap(), 5);
    }

    #[test]
    fn peek_more_than_available_errors() {
        let session = test_session();
        assert!(matches!(peek(&session, "draw_pile", 100), Err(DeckboxError::NotEnoughCards { .. })));
    }

    #[test]
    fn peek_empty_container_errors() {
        let session = test_session();
        assert!(matches!(peek(&session, "discard", 1), Err(DeckboxError::ContainerEmpty(_))));
    }

    #[test]
    fn shuffle_changes_order() {
        let yaml = r#"
name: "Big"
cards:
  - id: c
    text: "C"
    count: 20
"#;
        let def = DeckDefinition::from_yaml(yaml).unwrap();
        let mut session = Session::new("test", std::path::PathBuf::from("/test/deck.yaml"), &def, false);
        let before: Vec<String> = session.containers["draw_pile"].clone();
        shuffle(&mut session, "draw_pile").unwrap();
        let after: Vec<String> = session.containers["draw_pile"].clone();
        assert_eq!(before.len(), after.len());
        assert_ne!(before, after);
    }

    #[test]
    fn shuffle_unknown_container_errors() {
        let mut session = test_session();
        assert!(matches!(shuffle(&mut session, "nonexistent"), Err(DeckboxError::ContainerNotFound(_))));
    }

    #[test]
    fn draw_moves_cards_from_source_to_destination() {
        let mut session = test_session();
        let drawn = draw(&mut session, "draw_pile", "drawn", 2).unwrap();
        assert_eq!(drawn.len(), 2);
        assert_eq!(remaining(&session, "draw_pile").unwrap(), 3);
        assert_eq!(remaining(&session, "drawn").unwrap(), 2);
    }

    #[test]
    fn draw_takes_from_top() {
        let mut session = test_session();
        let top = session.containers["draw_pile"].last().unwrap().clone();
        let drawn = draw(&mut session, "draw_pile", "drawn", 1).unwrap();
        assert_eq!(drawn[0], top);
    }

    #[test]
    fn draw_auto_creates_destination() {
        let mut session = test_session();
        let drawn = draw(&mut session, "draw_pile", "hand", 1).unwrap();
        assert_eq!(drawn.len(), 1);
        assert!(session.containers.contains_key("hand"));
    }

    #[test]
    fn draw_from_empty_errors() {
        let mut session = test_session();
        assert!(matches!(draw(&mut session, "discard", "hand", 1), Err(DeckboxError::ContainerEmpty(_))));
    }

    #[test]
    fn draw_too_many_errors() {
        let mut session = test_session();
        assert!(matches!(draw(&mut session, "draw_pile", "drawn", 100), Err(DeckboxError::NotEnoughCards { .. })));
    }

    #[test]
    fn draw_from_unknown_source_errors() {
        let mut session = test_session();
        assert!(matches!(draw(&mut session, "nonexistent", "drawn", 1), Err(DeckboxError::ContainerNotFound(_))));
    }

    #[test]
    fn move_cards_between_containers() {
        let mut session = test_session();
        let drawn = draw(&mut session, "draw_pile", "drawn", 2).unwrap();
        let card = drawn[0].clone();
        move_cards(&mut session, &[card.clone()], "drawn", "discard").unwrap();
        assert_eq!(remaining(&session, "drawn").unwrap(), 1);
        assert_eq!(remaining(&session, "discard").unwrap(), 1);
        assert!(session.containers["discard"].contains(&card));
    }

    #[test]
    fn move_cards_not_in_source_errors() {
        let mut session = test_session();
        assert!(matches!(move_cards(&mut session, &["fake:1".into()], "draw_pile", "discard"), Err(DeckboxError::CardNotFound(_))));
    }

    #[test]
    fn move_cards_auto_creates_destination() {
        let mut session = test_session();
        let drawn = draw(&mut session, "draw_pile", "drawn", 1).unwrap();
        move_cards(&mut session, &drawn, "drawn", "new-pile").unwrap();
        assert!(session.containers.contains_key("new-pile"));
    }

    #[test]
    fn move_all_empties_source() {
        let mut session = test_session();
        draw(&mut session, "draw_pile", "discard", 3).unwrap();
        assert_eq!(remaining(&session, "discard").unwrap(), 3);
        move_all(&mut session, "discard", "draw_pile").unwrap();
        assert_eq!(remaining(&session, "discard").unwrap(), 0);
        assert_eq!(remaining(&session, "draw_pile").unwrap(), 5);
    }

    #[test]
    fn move_all_from_unknown_errors() {
        let mut session = test_session();
        assert!(matches!(move_all(&mut session, "nonexistent", "draw_pile"), Err(DeckboxError::ContainerNotFound(_))));
    }

    #[test]
    fn find_locates_card() {
        let session = test_session();
        let result = find(&session, "a:1").unwrap();
        assert_eq!(result, Some("draw_pile".to_string()));
    }

    #[test]
    fn find_returns_none_for_unknown() {
        let session = test_session();
        let result = find(&session, "nonexistent:1").unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn resolve_returns_card_definition() {
        let yaml = r#"
name: "Test"
cards:
  - id: alpha
    text: "Alpha card"
"#;
        let def = DeckDefinition::from_yaml(yaml).unwrap();
        let card = resolve("alpha:1", &def).unwrap();
        assert_eq!(card.id, "alpha");
        assert_eq!(card.text, "Alpha card");
    }

    #[test]
    fn draw_zero_returns_empty_without_side_effects() {
        let mut session = test_session();
        let drawn = draw(&mut session, "draw_pile", "new-dest", 0).unwrap();
        assert!(drawn.is_empty());
        // Should NOT auto-create the destination container
        assert!(!session.containers.contains_key("new-dest"));
    }

    #[test]
    fn peek_zero_returns_empty() {
        let session = test_session();
        let peeked = peek(&session, "draw_pile", 0).unwrap();
        assert!(peeked.is_empty());
    }

    #[test]
    fn peek_zero_on_empty_container_returns_empty() {
        let session = test_session();
        let peeked = peek(&session, "discard", 0).unwrap();
        assert!(peeked.is_empty());
    }

    #[test]
    fn move_empty_slice_is_noop() {
        let mut session = test_session();
        move_cards(&mut session, &[], "draw_pile", "new-dest").unwrap();
        // Should NOT auto-create the destination container
        assert!(!session.containers.contains_key("new-dest"));
        assert_eq!(remaining(&session, "draw_pile").unwrap(), 5);
    }

    #[test]
    fn containers_sorted_by_name() {
        let mut session = test_session();
        create_container(&mut session, "hand").unwrap();
        create_container(&mut session, "archive").unwrap();
        let cs = containers(&session);
        let names: Vec<&str> = cs.iter().map(|(n, _)| n.as_str()).collect();
        let mut sorted = names.clone();
        sorted.sort();
        assert_eq!(names, sorted);
    }

    #[test]
    fn resolve_unknown_instance_errors() {
        let yaml = r#"
name: "Test"
cards:
  - id: alpha
    text: "Alpha card"
"#;
        let def = DeckDefinition::from_yaml(yaml).unwrap();
        assert!(matches!(resolve("nonexistent:1", &def), Err(DeckboxError::CardNotFound(_))));
    }
}
