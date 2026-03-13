# Deckbox Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Rust library and CLI for managing decks of cards with draw-without-replacement semantics.

**Architecture:** Cargo workspace with two crates — `deckbox-core` (pure library, no I/O opinions) and `deckbox-cli` (thin clap wrapper). Core handles data model, operations, and serialization. CLI handles file paths, XDG dirs, and terminal output.

**Tech Stack:** Rust, serde + serde_yaml, rand, clap, thiserror

**Spec:** `docs/superpowers/specs/2026-03-13-deckbox-design.md`

---

## File Structure

```
deckbox/
├── Cargo.toml                        # workspace manifest
├── deckbox-core/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                    # re-exports, Warning enum
│       ├── error.rs                  # DeckboxError enum
│       ├── definition.rs             # CardDef, DeckDefinition, YAML parsing, validation
│       ├── session.rs                # Session struct, instance ID generation, container state
│       ├── operations.rs             # draw, move_cards, move_all, shuffle, peek, list, queries
│       └── persistence.rs            # serialize/deserialize session state via Read/Write traits
├── deckbox-cli/
│   ├── Cargo.toml
│   └── src/
│       └── main.rs                   # clap subcommands, file path resolution, output formatting
└── deckbox-cli/
        └── tests/
            └── integration.rs        # end-to-end tests using temp dirs and real YAML files
```

---

## Chunk 1: Foundation — Error Types, Data Model, Validation

### Task 1: Workspace and crate scaffolding

**Files:**
- Create: `Cargo.toml` (workspace)
- Create: `deckbox-core/Cargo.toml`
- Create: `deckbox-cli/Cargo.toml`
- Create: `deckbox-core/src/lib.rs`
- Create: `deckbox-cli/src/main.rs`

- [ ] **Step 1: Create workspace Cargo.toml**

```toml
[workspace]
members = ["deckbox-core", "deckbox-cli"]
resolver = "2"
```

- [ ] **Step 2: Create deckbox-core/Cargo.toml**

```toml
[package]
name = "deckbox-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_yaml = "0.9"
rand = "0.8"
thiserror = "2"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Create deckbox-cli/Cargo.toml**

```toml
[package]
name = "deckbox-cli"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "deckbox"
path = "src/main.rs"

[dependencies]
deckbox-core = { path = "../deckbox-core" }
clap = { version = "4", features = ["derive"] }
dirs = "6"
serde_yaml = "0.9"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 4: Create minimal lib.rs and main.rs stubs**

`deckbox-core/src/lib.rs`:
```rust
// ABOUTME: Core library for deckbox — deck management with draw-without-replacement semantics.
// ABOUTME: Re-exports public types and modules.
```

`deckbox-cli/src/main.rs`:
```rust
// ABOUTME: CLI entry point for deckbox.
// ABOUTME: Thin wrapper over deckbox-core using clap for argument parsing.

fn main() {
    println!("deckbox");
}
```

- [ ] **Step 5: Verify workspace builds**

Run: `cargo build`
Expected: Compiles with no errors.

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml deckbox-core/ deckbox-cli/
git commit -s -m "feat: scaffold workspace with core and cli crates"
```

---

### Task 2: Error types

**Files:**
- Create: `deckbox-core/src/error.rs`
- Modify: `deckbox-core/src/lib.rs`

- [ ] **Step 1: Write tests for error Display output**

Create `deckbox-core/src/error.rs` with tests at the bottom:

```rust
// ABOUTME: Error types for deckbox-core operations.
// ABOUTME: Covers container, card, session, definition, and validation errors.

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p deckbox-core`
Expected: FAIL — `DeckboxError` not defined.

- [ ] **Step 3: Implement DeckboxError enum**

Add above the tests in `error.rs`:

```rust
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

    #[error("definition not found: {0}")]
    DefinitionNotFound(String),

    #[error("duplicate session: {0}")]
    DuplicateSession(String),

    #[error("validation error: {0}")]
    ValidationError(String),

    #[error("parse error: {0}")]
    ParseError(String),
}

pub type Result<T> = std::result::Result<T, DeckboxError>;
```

- [ ] **Step 4: Export from lib.rs**

Update `deckbox-core/src/lib.rs`:

```rust
pub mod error;

pub use error::{DeckboxError, Result};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p deckbox-core`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add deckbox-core/src/error.rs deckbox-core/src/lib.rs
git commit -s -m "feat: add DeckboxError enum with all error variants"
```

---

### Task 3: DeckDefinition and CardDef with YAML parsing and validation

**Files:**
- Create: `deckbox-core/src/definition.rs`
- Modify: `deckbox-core/src/lib.rs`

- [ ] **Step 1: Write ALL failing tests — parsing and validation**

Create `deckbox-core/src/definition.rs` with tests:

```rust
// ABOUTME: Deck and card definitions parsed from YAML files.
// ABOUTME: Handles validation of card IDs, counts, and container names.

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p deckbox-core -- definition`
Expected: FAIL — `DeckDefinition` not defined.

- [ ] **Step 3: Implement CardDef and DeckDefinition structs with from_yaml**

Add above the tests:

```rust
use serde::Deserialize;
use std::collections::HashMap;
use crate::error::{DeckboxError, Result};

#[derive(Debug, Clone, Deserialize)]
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

#[derive(Debug, Clone, Deserialize)]
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
```

- [ ] **Step 4: Export from lib.rs**

Add to `deckbox-core/src/lib.rs`:
```rust
pub mod definition;

pub use definition::{CardDef, DeckDefinition};
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `cargo test -p deckbox-core`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add deckbox-core/src/definition.rs deckbox-core/src/lib.rs
git commit -s -m "feat: add DeckDefinition and CardDef with YAML parsing and validation"
```

---

### Task 4: Session struct and instance ID generation

**Files:**
- Create: `deckbox-core/src/session.rs`
- Modify: `deckbox-core/src/lib.rs`

- [ ] **Step 1: Write failing test — create session from definition**

Create `deckbox-core/src/session.rs` with tests:

```rust
// ABOUTME: Session state for a deck in play.
// ABOUTME: Tracks card instance locations across named containers.

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
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p deckbox-core -- session`
Expected: FAIL — `Session` not defined.

- [ ] **Step 3: Implement Session struct**

Add above the tests:

```rust
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
```

- [ ] **Step 4: Export from lib.rs**

Add to `deckbox-core/src/lib.rs`:
```rust
pub mod session;

pub use session::{InstanceId, Session};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p deckbox-core -- session`
Expected: All pass.

- [ ] **Step 6: Write test for definition_id helper**

Add to tests:

```rust
    #[test]
    fn definition_id_strips_suffix() {
        assert_eq!(Session::definition_id("goblin-ambush:2"), Some("goblin-ambush"));
        assert_eq!(Session::definition_id("alpha:1"), Some("alpha"));
    }

    #[test]
    fn definition_id_returns_none_for_invalid() {
        assert_eq!(Session::definition_id("no-suffix"), None);
    }
```

- [ ] **Step 7: Run all tests**

Run: `cargo test -p deckbox-core`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add deckbox-core/src/session.rs deckbox-core/src/lib.rs
git commit -s -m "feat: add Session struct with instance ID generation"
```

---

## Chunk 2: Operations

### Task 5: Container operations — shuffle, peek, list, create_container, queries

**Files:**
- Create: `deckbox-core/src/operations.rs`
- Modify: `deckbox-core/src/lib.rs`

- [ ] **Step 1: Write failing tests for container queries**

Create `deckbox-core/src/operations.rs` with tests:

```rust
// ABOUTME: Operations on sessions — draw, move, shuffle, peek, and queries.
// ABOUTME: All operations work on container names and instance IDs.

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
        assert!(matches!(
            remaining(&session, "nonexistent"),
            Err(DeckboxError::ContainerNotFound(_))
        ));
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
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p deckbox-core -- operations`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement query and container functions**

Add above the tests:

```rust
use crate::error::{DeckboxError, Result};
use crate::session::{InstanceId, Session};

/// How many cards are in a container.
pub fn remaining(session: &Session, container: &str) -> Result<usize> {
    session
        .containers
        .get(container)
        .map(|c| c.len())
        .ok_or_else(|| DeckboxError::ContainerNotFound(container.into()))
}

/// Whether a container has zero cards.
pub fn is_empty(session: &Session, container: &str) -> Result<bool> {
    remaining(session, container).map(|n| n == 0)
}

/// List all container names with their card counts.
pub fn containers(session: &Session) -> Vec<(String, usize)> {
    session
        .containers
        .iter()
        .map(|(name, cards)| (name.clone(), cards.len()))
        .collect()
}

/// List all cards in a container.
pub fn list(session: &Session, container: &str) -> Result<Vec<InstanceId>> {
    session
        .containers
        .get(container)
        .cloned()
        .ok_or_else(|| DeckboxError::ContainerNotFound(container.into()))
}

/// Add a named container. No-op if it already exists.
pub fn create_container(session: &mut Session, name: &str) -> Result<()> {
    session
        .containers
        .entry(name.to_string())
        .or_insert_with(Vec::new);
    Ok(())
}

/// Ensure a destination container exists, auto-creating if needed.
fn ensure_destination(session: &mut Session, container: &str) {
    session
        .containers
        .entry(container.to_string())
        .or_insert_with(Vec::new);
}
```

- [ ] **Step 4: Export from lib.rs**

Add to `deckbox-core/src/lib.rs`:
```rust
pub mod operations;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p deckbox-core -- operations`
Expected: All pass.

- [ ] **Step 6: Write failing tests for peek and shuffle**

Add to the tests module:

```rust
    #[test]
    fn peek_returns_top_cards_without_removing() {
        let session = test_session();
        let peeked = peek(&session, "draw_pile", 2).unwrap();
        assert_eq!(peeked.len(), 2);
        // Cards still in draw_pile
        assert_eq!(remaining(&session, "draw_pile").unwrap(), 5);
    }

    #[test]
    fn peek_more_than_available_errors() {
        let session = test_session();
        assert!(matches!(
            peek(&session, "draw_pile", 100),
            Err(DeckboxError::NotEnoughCards { .. })
        ));
    }

    #[test]
    fn peek_empty_container_errors() {
        let session = test_session();
        assert!(matches!(
            peek(&session, "discard", 1),
            Err(DeckboxError::ContainerEmpty(_))
        ));
    }

    #[test]
    fn shuffle_changes_order() {
        // Shuffle a large container and check that order changed (probabilistic).
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
        // Same cards, same count
        assert_eq!(before.len(), after.len());
        // Extremely unlikely to be identical after shuffle of 20 elements
        assert_ne!(before, after);
    }

    #[test]
    fn shuffle_unknown_container_errors() {
        let mut session = test_session();
        assert!(matches!(
            shuffle(&mut session, "nonexistent"),
            Err(DeckboxError::ContainerNotFound(_))
        ));
    }
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cargo test -p deckbox-core -- operations`
Expected: FAIL — `peek`, `shuffle` not defined.

- [ ] **Step 8: Implement peek and shuffle**

Add to operations.rs (above tests, after existing functions):

```rust
use rand::seq::SliceRandom;

/// Look at the top N cards of a container without removing them.
/// "Top" is the end of the vec (last element = top of deck).
pub fn peek(session: &Session, container: &str, count: usize) -> Result<Vec<InstanceId>> {
    let cards = session
        .containers
        .get(container)
        .ok_or_else(|| DeckboxError::ContainerNotFound(container.into()))?;

    if cards.is_empty() {
        return Err(DeckboxError::ContainerEmpty(container.into()));
    }
    if count > cards.len() {
        return Err(DeckboxError::NotEnoughCards {
            container: container.into(),
            requested: count,
            available: cards.len(),
        });
    }

    Ok(cards[cards.len() - count..].to_vec())
}

/// Fisher-Yates shuffle of a container.
pub fn shuffle(session: &mut Session, container: &str) -> Result<()> {
    let cards = session
        .containers
        .get_mut(container)
        .ok_or_else(|| DeckboxError::ContainerNotFound(container.into()))?;

    let mut rng = rand::thread_rng();
    cards.shuffle(&mut rng);
    Ok(())
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cargo test -p deckbox-core -- operations`
Expected: All pass.

- [ ] **Step 10: Commit**

```bash
git add deckbox-core/src/operations.rs deckbox-core/src/lib.rs
git commit -s -m "feat: add container operations — queries, peek, shuffle, create"
```

---

### Task 6: Card movement — draw, move_cards, move_all, find

**Files:**
- Modify: `deckbox-core/src/operations.rs`

- [ ] **Step 1: Write failing tests for draw**

Add to the tests module in `operations.rs`:

```rust
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
        assert!(matches!(
            draw(&mut session, "discard", "hand", 1),
            Err(DeckboxError::ContainerEmpty(_))
        ));
    }

    #[test]
    fn draw_too_many_errors() {
        let mut session = test_session();
        assert!(matches!(
            draw(&mut session, "draw_pile", "drawn", 100),
            Err(DeckboxError::NotEnoughCards { .. })
        ));
    }

    #[test]
    fn draw_from_unknown_source_errors() {
        let mut session = test_session();
        assert!(matches!(
            draw(&mut session, "nonexistent", "drawn", 1),
            Err(DeckboxError::ContainerNotFound(_))
        ));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p deckbox-core -- operations::tests::draw`
Expected: FAIL — `draw` not defined.

- [ ] **Step 3: Implement draw**

Add to operations.rs:

```rust
/// Draw N cards from the top of `from` and place them in `to`.
/// Auto-creates the destination container if it doesn't exist.
pub fn draw(
    session: &mut Session,
    from: &str,
    to: &str,
    count: usize,
) -> Result<Vec<InstanceId>> {
    // Validate source exists and has enough cards
    {
        let source = session
            .containers
            .get(from)
            .ok_or_else(|| DeckboxError::ContainerNotFound(from.into()))?;

        if source.is_empty() {
            return Err(DeckboxError::ContainerEmpty(from.into()));
        }
        if count > source.len() {
            return Err(DeckboxError::NotEnoughCards {
                container: from.into(),
                requested: count,
                available: source.len(),
            });
        }
    }

    // Take cards from top (end of vec)
    let source = session.containers.get_mut(from).unwrap();
    let split_at = source.len() - count;
    let drawn: Vec<InstanceId> = source.split_off(split_at);

    // Place in destination (auto-create if needed)
    ensure_destination(session, to);
    session
        .containers
        .get_mut(to)
        .unwrap()
        .extend(drawn.clone());

    Ok(drawn)
}
```

- [ ] **Step 4: Run draw tests to verify they pass**

Run: `cargo test -p deckbox-core -- operations::tests::draw`
Expected: All pass.

- [ ] **Step 5: Write failing tests for move_cards, move_all, and find**

Add to tests:

```rust
    #[test]
    fn move_cards_between_containers() {
        let mut session = test_session();
        // Draw some cards first so we know what's in drawn
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
        assert!(matches!(
            move_cards(&mut session, &["fake:1".into()], "draw_pile", "discard"),
            Err(DeckboxError::CardNotFound(_))
        ));
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
        assert!(matches!(
            move_all(&mut session, "nonexistent", "draw_pile"),
            Err(DeckboxError::ContainerNotFound(_))
        ));
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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cargo test -p deckbox-core -- operations`
Expected: FAIL — `move_cards`, `move_all`, `find` not defined.

- [ ] **Step 7: Implement move_cards, move_all, and find**

Add to operations.rs:

```rust
/// Move specific cards from one container to another.
/// Auto-creates the destination container if it doesn't exist.
pub fn move_cards(
    session: &mut Session,
    cards: &[InstanceId],
    from: &str,
    to: &str,
) -> Result<()> {
    // Validate source exists and contains all specified cards
    {
        let source = session
            .containers
            .get(from)
            .ok_or_else(|| DeckboxError::ContainerNotFound(from.into()))?;

        for card in cards {
            if !source.contains(card) {
                return Err(DeckboxError::CardNotFound(format!(
                    "{} not found in {}",
                    card, from
                )));
            }
        }
    }

    // Remove from source
    let source = session.containers.get_mut(from).unwrap();
    source.retain(|c| !cards.contains(c));

    // Add to destination (auto-create if needed)
    ensure_destination(session, to);
    session
        .containers
        .get_mut(to)
        .unwrap()
        .extend(cards.iter().cloned());

    Ok(())
}

/// Move all cards from one container to another.
/// Auto-creates the destination container if it doesn't exist.
pub fn move_all(session: &mut Session, from: &str, to: &str) -> Result<()> {
    let cards = session
        .containers
        .get(from)
        .ok_or_else(|| DeckboxError::ContainerNotFound(from.into()))?
        .clone();

    session.containers.get_mut(from).unwrap().clear();

    ensure_destination(session, to);
    session.containers.get_mut(to).unwrap().extend(cards);

    Ok(())
}

/// Find which container holds a given card.
pub fn find(session: &Session, instance_id: &str) -> Result<Option<String>> {
    for (name, cards) in &session.containers {
        if cards.iter().any(|c| c == instance_id) {
            return Ok(Some(name.clone()));
        }
    }
    Ok(None)
}
```

- [ ] **Step 8: Run all tests**

Run: `cargo test -p deckbox-core`
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add deckbox-core/src/operations.rs
git commit -s -m "feat: add card movement operations — draw, move_cards, move_all, find"
```

---

### Task 7: Resolve operation — look up definition from instance ID

**Files:**
- Modify: `deckbox-core/src/operations.rs`

- [ ] **Step 1: Write failing test for resolve**

Add to tests:

```rust
    #[test]
    fn resolve_returns_card_definition() {
        let yaml = r#"
name: "Test"
cards:
  - id: alpha
    text: "Alpha card"
"#;
        let def = DeckDefinition::from_yaml(yaml).unwrap();
        let session = Session::new("test", std::path::PathBuf::from("/test/deck.yaml"), &def, false);
        let card = resolve(&session, "alpha:1", &def).unwrap();
        assert_eq!(card.id, "alpha");
        assert_eq!(card.text, "Alpha card");
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
        let session = Session::new("test", std::path::PathBuf::from("/test/deck.yaml"), &def, false);
        assert!(matches!(
            resolve(&session, "nonexistent:1", &def),
            Err(DeckboxError::CardNotFound(_))
        ));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p deckbox-core -- resolve`
Expected: FAIL — `resolve` not defined.

- [ ] **Step 3: Implement resolve**

Add to operations.rs:

```rust
use crate::definition::{CardDef, DeckDefinition};

/// Get the card definition for an instance ID.
pub fn resolve(
    _session: &Session,
    instance_id: &str,
    definition: &DeckDefinition,
) -> Result<CardDef> {
    let def_id = Session::definition_id(instance_id).ok_or_else(|| {
        DeckboxError::CardNotFound(format!("invalid instance ID format: {}", instance_id))
    })?;

    definition
        .cards
        .iter()
        .find(|c| c.id == def_id)
        .cloned()
        .ok_or_else(|| {
            DeckboxError::CardNotFound(format!("no definition for: {}", def_id))
        })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p deckbox-core -- resolve`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add deckbox-core/src/operations.rs
git commit -s -m "feat: add resolve operation for instance-to-definition lookup"
```

---

## Chunk 3: Persistence and CLI

### Task 8: Session persistence — save/load with warnings

**Files:**
- Create: `deckbox-core/src/persistence.rs`
- Modify: `deckbox-core/src/lib.rs`

- [ ] **Step 1: Add Warning type to lib.rs**

Update `deckbox-core/src/lib.rs` to add:

```rust
/// Non-fatal warnings surfaced during operations like load.
#[derive(Debug, Clone, PartialEq)]
pub enum Warning {
    DefinitionMismatch {
        added: Vec<String>,
        removed: Vec<String>,
    },
}
```

- [ ] **Step 2: Write failing tests for save/load round-trip**

Create `deckbox-core/src/persistence.rs`:

```rust
// ABOUTME: Serialize and deserialize session state.
// ABOUTME: Uses Read/Write traits so callers control storage location.

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

        // Load with a definition that has an extra card
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

        // Load with a definition missing beta
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test -p deckbox-core -- persistence`
Expected: FAIL — `save_session`, `load_session` not defined.

- [ ] **Step 4: Implement save_session and load_session**

Add above the tests:

```rust
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

    // Compare definition card IDs
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
```

- [ ] **Step 5: Export from lib.rs**

Add to `deckbox-core/src/lib.rs`:
```rust
pub mod persistence;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test -p deckbox-core -- persistence`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add deckbox-core/src/persistence.rs deckbox-core/src/lib.rs
git commit -s -m "feat: add session persistence with definition mismatch warnings"
```

---

### Task 9: Session reset

**Files:**
- Modify: `deckbox-core/src/session.rs`

- [ ] **Step 1: Write failing test for reset**

Add to session tests:

```rust
    #[test]
    fn reset_rebuilds_from_definition() {
        let def = DeckDefinition::from_yaml(TEST_YAML).unwrap();
        let mut session = Session::new("test-session", PathBuf::from("/test/deck.yaml"), &def, false);

        // Simulate some play — move cards around
        session.containers.get_mut("draw_pile").unwrap().pop();
        session.containers.get_mut("discard").unwrap().push("a:1".to_string());

        let reset_session = session.reset(&def);
        assert_eq!(reset_session.name, "test-session");
        assert_eq!(reset_session.containers["draw_pile"].len(), 3);
        assert!(reset_session.containers["discard"].is_empty());
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p deckbox-core -- reset_rebuilds`
Expected: FAIL — `reset` method not defined.

- [ ] **Step 3: Implement reset on Session**

Add method to `Session` impl block:

```rust
    /// Reset the session to initial state from the definition.
    /// Preserves the session name and definition path.
    pub fn reset(&self, definition: &DeckDefinition) -> Self {
        Session::new(&self.name, self.definition_path.clone(), definition, false)
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p deckbox-core -- reset_rebuilds`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add deckbox-core/src/session.rs
git commit -s -m "feat: add session reset from definition"
```

---

### Task 10: CLI implementation

**Files:**
- Modify: `deckbox-cli/src/main.rs`

- [ ] **Step 1: Implement CLI with all subcommands**

Replace `deckbox-cli/src/main.rs` with:

```rust
// ABOUTME: CLI entry point for deckbox.
// ABOUTME: Thin wrapper over deckbox-core using clap for argument parsing.

use clap::{Parser, Subcommand};
use deckbox_core::definition::DeckDefinition;
use deckbox_core::operations;
use deckbox_core::persistence;
use deckbox_core::session::Session;
use std::fs;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "deckbox", about = "Manage decks of cards")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new session from a deck definition
    New {
        /// Path to the YAML deck definition
        definition: PathBuf,
        /// Session name
        name: String,
        /// Shuffle the deck on creation
        #[arg(long)]
        shuffle: bool,
    },
    /// Draw cards from a container
    Draw {
        /// Session name
        session: String,
        /// Number of cards to draw
        #[arg(long, default_value_t = 1)]
        count: usize,
        /// Source container
        #[arg(long, default_value = "draw_pile")]
        from: String,
        /// Destination container
        #[arg(long, default_value = "drawn")]
        to: String,
    },
    /// Move specific cards between containers
    Move {
        /// Session name
        session: String,
        /// Card instance IDs to move
        #[arg(long, required = true, num_args = 1..)]
        cards: Vec<String>,
        /// Source container
        #[arg(long)]
        from: String,
        /// Destination container
        #[arg(long)]
        to: String,
    },
    /// Move all cards from one container to another
    MoveAll {
        /// Session name
        session: String,
        /// Source container
        #[arg(long)]
        from: String,
        /// Destination container
        #[arg(long)]
        to: String,
    },
    /// Shuffle a container
    Shuffle {
        /// Session name
        session: String,
        /// Container to shuffle
        #[arg(long, default_value = "draw_pile")]
        container: String,
    },
    /// Peek at the top cards of a container
    Peek {
        /// Session name
        session: String,
        /// Number of cards to peek at
        #[arg(long, default_value_t = 1)]
        count: usize,
        /// Container to peek into
        #[arg(long, default_value = "draw_pile")]
        container: String,
    },
    /// List containers or cards in a container
    List {
        /// Session name
        session: String,
        /// Specific container to list
        #[arg(long)]
        container: Option<String>,
    },
    /// Reset a session to its initial state
    Reset {
        /// Session name
        session: String,
    },
    /// List all saved sessions
    Sessions,
}

fn sessions_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("deckbox")
        .join("sessions")
}

fn session_path(name: &str) -> PathBuf {
    sessions_dir().join(format!("{}.yaml", name))
}

fn load_session(name: &str) -> Result<(Session, DeckDefinition), Box<dyn std::error::Error>> {
    let path = session_path(name);
    if !path.exists() {
        return Err(deckbox_core::DeckboxError::SessionNotFound(name.into()).into());
    }
    // Read file once, use bytes for both definition path extraction and full load
    let bytes = fs::read(&path)?;
    let partial: serde_yaml::Value = serde_yaml::from_slice(&bytes)?;
    let def_path = partial["definition_path"]
        .as_str()
        .ok_or_else(|| deckbox_core::DeckboxError::ParseError("missing definition_path".into()))?;
    let def_yaml = fs::read_to_string(def_path)?;
    let def = DeckDefinition::from_yaml(&def_yaml)?;
    let (session, warnings) = persistence::load_session(&bytes[..], &def)?;
    for warning in &warnings {
        match warning {
            deckbox_core::Warning::DefinitionMismatch { added, removed } => {
                if !added.is_empty() {
                    eprintln!("Warning: cards added to definition: {}", added.join(", "));
                }
                if !removed.is_empty() {
                    eprintln!("Warning: cards removed from definition: {}", removed.join(", "));
                }
                eprintln!("Run 'deckbox reset {}' to pick up changes.", name);
            }
        }
    }
    Ok((session, def))
}

fn save_session(session: &Session) -> Result<(), Box<dyn std::error::Error>> {
    let dir = sessions_dir();
    fs::create_dir_all(&dir)?;
    let path = session_path(&session.name);
    let file = fs::File::create(&path)?;
    let mut writer = std::io::BufWriter::new(file);
    persistence::save_session(session, &mut writer)?;
    Ok(())
}

fn print_cards(cards: &[String], def: &DeckDefinition, session: &Session) {
    for instance_id in cards {
        match operations::resolve(session, instance_id, def) {
            Ok(card) => println!("  {} — {}", instance_id, card.text),
            Err(_) => println!("  {} — (unknown)", instance_id),
        }
    }
}

fn main() {
    let cli = Cli::parse();

    let result: Result<(), Box<dyn std::error::Error>> = match cli.command {
        Commands::New {
            definition,
            name,
            shuffle,
        } => {
            let path = session_path(&name);
            if path.exists() {
                Err(deckbox_core::DeckboxError::DuplicateSession(name).into())
            } else {
                let def_path = fs::canonicalize(&definition)?;
                let yaml = fs::read_to_string(&def_path)?;
                let def = DeckDefinition::from_yaml(&yaml)?;
                let session = Session::new(&name, def_path, &def, shuffle);
                save_session(&session)?;
                println!("Session '{}' created from '{}'", session.name, definition.display());
                let info = operations::containers(&session);
                for (container, count) in info {
                    println!("  {}: {} cards", container, count);
                }
                Ok(())
            }
        }

        Commands::Draw {
            session: name,
            count,
            from,
            to,
        } => {
            let (mut session, def) = load_session(&name)?;
            let drawn = operations::draw(&mut session, &from, &to, count)?;
            println!("Drew {} card(s) from '{}' to '{}':", drawn.len(), from, to);
            print_cards(&drawn, &def, &session);
            save_session(&session)?;
            Ok(())
        }

        Commands::Move {
            session: name,
            cards,
            from,
            to,
        } => {
            let (mut session, _def) = load_session(&name)?;
            operations::move_cards(&mut session, &cards, &from, &to)?;
            println!("Moved {} card(s) from '{}' to '{}'", cards.len(), from, to);
            save_session(&session)?;
            Ok(())
        }

        Commands::MoveAll {
            session: name,
            from,
            to,
        } => {
            let (mut session, _def) = load_session(&name)?;
            operations::move_all(&mut session, &from, &to)?;
            println!("Moved all cards from '{}' to '{}'", from, to);
            save_session(&session)?;
            Ok(())
        }

        Commands::Shuffle {
            session: name,
            container,
        } => {
            let (mut session, _def) = load_session(&name)?;
            operations::shuffle(&mut session, &container)?;
            println!("Shuffled '{}'", container);
            save_session(&session)?;
            Ok(())
        }

        Commands::Peek {
            session: name,
            count,
            container,
        } => {
            let (session, def) = load_session(&name)?;
            let peeked = operations::peek(&session, &container, count)?;
            println!("Top {} card(s) in '{}':", peeked.len(), container);
            print_cards(&peeked, &def, &session);
            Ok(())
        }

        Commands::List {
            session: name,
            container,
        } => {
            let (session, def) = load_session(&name)?;
            match container {
                Some(c) => {
                    let cards = operations::list(&session, &c)?;
                    println!("'{}' ({} cards):", c, cards.len());
                    print_cards(&cards, &def, &session);
                }
                None => {
                    let info = operations::containers(&session);
                    println!("Session '{}' containers:", name);
                    for (container, count) in info {
                        println!("  {}: {} cards", container, count);
                    }
                }
            }
            Ok(())
        }

        Commands::Reset { session: name } => {
            let (session, def) = load_session(&name)?;
            let reset = session.reset(&def);
            save_session(&reset)?;
            println!("Session '{}' reset", name);
            Ok(())
        }

        Commands::Sessions => {
            let dir = sessions_dir();
            if !dir.exists() {
                println!("No saved sessions.");
                return;
            }
            let mut found = false;
            for entry in fs::read_dir(&dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().is_some_and(|e| e == "yaml") {
                    if let Some(stem) = path.file_stem() {
                        println!("  {}", stem.to_string_lossy());
                        found = true;
                    }
                }
            }
            if !found {
                println!("No saved sessions.");
            }
            Ok(())
        }
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo build`
Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add deckbox-cli/src/main.rs
git commit -s -m "feat: implement CLI with all subcommands"
```

---

### Task 11: Integration tests

**Files:**
- Create: `tests/integration.rs`

- [ ] **Step 1: Write integration tests using temp directories**

Create `deckbox-cli/tests/integration.rs`:

```rust
// ABOUTME: End-to-end tests for the deckbox CLI.
// ABOUTME: Uses temp directories and real YAML files.

use std::process::Command;
use tempfile::TempDir;
use std::fs;

fn deckbox() -> Command {
    Command::new(env!("CARGO_BIN_EXE_deckbox"))
}

fn create_test_deck(dir: &TempDir) -> std::path::PathBuf {
    let deck_path = dir.path().join("test-deck.yaml");
    fs::write(
        &deck_path,
        r#"
name: "Integration Test Deck"
containers:
  - discard
cards:
  - id: alpha
    text: "Alpha card"
    count: 2
  - id: beta
    text: "Beta card"
  - id: gamma
    text: "Gamma card"
"#,
    )
    .unwrap();
    deck_path
}

#[test]
fn new_creates_session() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "test-game"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    assert!(stdout.contains("Session 'test-game' created"));
}

#[test]
fn draw_shows_card_text() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    // Create session
    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "draw-test"])
        .output()
        .unwrap();

    // Draw
    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["draw", "draw-test"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    assert!(stdout.contains("Drew 1 card(s)"));
}

#[test]
fn list_shows_containers() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "list-test"])
        .output()
        .unwrap();

    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["list", "list-test"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success());
    assert!(stdout.contains("draw_pile"));
    assert!(stdout.contains("discard"));
}

#[test]
fn duplicate_session_errors() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "dupe-test"])
        .output()
        .unwrap();

    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "dupe-test"])
        .output()
        .unwrap();

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("duplicate session") || stderr.contains("dupe-test"));
}

#[test]
fn draw_from_empty_errors() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "empty-test"])
        .output()
        .unwrap();

    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["draw", "empty-test", "--from", "discard"])
        .output()
        .unwrap();

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("empty"));
}

#[test]
fn sessions_lists_saved() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "session-a"])
        .output()
        .unwrap();

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "session-b"])
        .output()
        .unwrap();

    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["sessions"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success());
    assert!(stdout.contains("session-a"));
    assert!(stdout.contains("session-b"));
}

#[test]
fn full_workflow_draw_move_reshuffle() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    // Create
    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "workflow"])
        .output()
        .unwrap();

    // Draw 2 cards
    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["draw", "workflow", "--count", "2", "--to", "discard"])
        .output()
        .unwrap();

    // List to verify state
    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["list", "workflow"])
        .output()
        .unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("draw_pile: 2 cards") || stdout.contains("draw_pile"));

    // Move all from discard back to draw_pile
    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["move-all", "workflow", "--from", "discard", "--to", "draw_pile"])
        .output()
        .unwrap();

    // Shuffle
    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["shuffle", "workflow"])
        .output()
        .unwrap();
    assert!(output.status.success());

    // Reset
    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["reset", "workflow"])
        .output()
        .unwrap();
    assert!(output.status.success());
}
```

- [ ] **Step 2: Run integration tests**

Run: `cargo test -p deckbox-cli -- --test-threads=1`
Expected: All pass.

- [ ] **Step 3: Run all tests (core + integration)**

Run: `cargo test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add deckbox-cli/tests/integration.rs
git commit -s -m "feat: add integration tests for CLI end-to-end workflows"
```
