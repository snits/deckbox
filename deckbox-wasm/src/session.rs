// ABOUTME: WASM bindings for ephemeral session operations — new_session, draw,
// ABOUTME: peek, shuffle — exposing deckbox-core's Session and operations module.

use std::path::PathBuf;

use deckbox_core::{DeckDefinition, Session};
use rand::rngs::StdRng;
use rand::SeedableRng;
use serde_json::json;
use wasm_bindgen::prelude::wasm_bindgen;

/// Build a fresh, unshuffled session from deck YAML.
///
/// Parses through `DeckDefinition::from_yaml` (not a bare deserialize) since
/// a session over an invalid deck is meaningless — the UI only ever builds
/// sessions from decks it has already validated.
#[wasm_bindgen]
pub fn new_session(deck_yaml: &str) -> String {
    let def = match DeckDefinition::from_yaml(deck_yaml) {
        Ok(d) => d,
        Err(e) => return json!({ "error": e.to_string() }).to_string(),
    };
    let session = Session::new("webui", PathBuf::from("-"), &def, false);
    serde_json::to_string(&session).expect("Session serializes")
}

/// Draw `count` cards from `draw_pile` into `drawn`, auto-creating `drawn`.
#[wasm_bindgen]
pub fn draw(session_json: &str, count: u32) -> String {
    let mut session: Session = match serde_json::from_str(session_json) {
        Ok(s) => s,
        Err(e) => return json!({ "error": e.to_string() }).to_string(),
    };
    match deckbox_core::operations::draw(&mut session, "draw_pile", "drawn", count as usize) {
        Ok(drawn) => json!({ "session": session, "drawn": drawn }).to_string(),
        Err(e) => json!({ "error": e.to_string() }).to_string(),
    }
}

/// Peek at the top `count` cards of `draw_pile` without mutating the session.
#[wasm_bindgen]
pub fn peek(session_json: &str, count: u32) -> String {
    let session: Session = match serde_json::from_str(session_json) {
        Ok(s) => s,
        Err(e) => return json!({ "error": e.to_string() }).to_string(),
    };
    match deckbox_core::operations::peek(&session, "draw_pile", count as usize) {
        Ok(cards) => json!({ "cards": cards }).to_string(),
        Err(e) => json!({ "error": e.to_string() }).to_string(),
    }
}

/// Shuffle `draw_pile` deterministically from `seed`.
#[wasm_bindgen]
pub fn shuffle(session_json: &str, seed: u32) -> String {
    let mut session: Session = match serde_json::from_str(session_json) {
        Ok(s) => s,
        Err(e) => return json!({ "error": e.to_string() }).to_string(),
    };
    let mut rng = StdRng::seed_from_u64(seed as u64);
    match deckbox_core::operations::shuffle_with_rng(&mut session, "draw_pile", &mut rng) {
        Ok(()) => serde_json::to_string(&session).expect("Session serializes"),
        Err(e) => json!({ "error": e.to_string() }).to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_DECK_YAML: &str = r#"
name: "Session Test Deck"
containers:
  - discard
cards:
  - id: alpha
    text: "Alpha"
  - id: beta
    text: "Beta"
  - id: gamma
    text: "Gamma"
  - id: delta
    text: "Delta"
"#;

    fn fresh_session_json() -> String {
        new_session(TEST_DECK_YAML)
    }

    #[test]
    fn new_session_pile_is_definition_order_with_declared_containers_empty() {
        let out: serde_json::Value = serde_json::from_str(&fresh_session_json()).unwrap();
        let draw_pile: Vec<&str> = out["containers"]["draw_pile"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(draw_pile, vec!["alpha:1", "beta:1", "gamma:1", "delta:1"]);
        assert_eq!(out["containers"]["discard"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn new_session_invalid_deck_returns_error() {
        let out: serde_json::Value = serde_json::from_str(&new_session("cards: []\n")).unwrap();
        assert!(out["error"].is_string());
    }

    #[test]
    fn draw_one_returns_last_defined_instance() {
        let session_json = fresh_session_json();
        let out: serde_json::Value = serde_json::from_str(&draw(&session_json, 1)).unwrap();
        let drawn: Vec<&str> = out["drawn"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(drawn, vec!["delta:1"]);
    }

    #[test]
    fn draw_three_is_pile_ascending_with_top_last() {
        let session_json = fresh_session_json();
        let out: serde_json::Value = serde_json::from_str(&draw(&session_json, 3)).unwrap();
        let drawn: Vec<&str> = out["drawn"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(drawn, vec!["beta:1", "gamma:1", "delta:1"]);
        let remaining: Vec<&str> = out["session"]["containers"]["draw_pile"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(remaining, vec!["alpha:1"]);
    }

    #[test]
    fn drawn_container_is_created_and_accumulates() {
        let session_json = fresh_session_json();
        let first: serde_json::Value = serde_json::from_str(&draw(&session_json, 1)).unwrap();
        let second_session_json = first["session"].to_string();
        let second: serde_json::Value =
            serde_json::from_str(&draw(&second_session_json, 1)).unwrap();
        let drawn: Vec<&str> = second["session"]["containers"]["drawn"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(drawn, vec!["delta:1", "gamma:1"]);
    }

    #[test]
    fn over_draw_returns_error() {
        let session_json = fresh_session_json();
        let out: serde_json::Value = serde_json::from_str(&draw(&session_json, 5)).unwrap();
        assert!(out["error"].is_string());
    }

    #[test]
    fn peek_returns_last_n_without_mutating() {
        let session_json = fresh_session_json();
        let out: serde_json::Value = serde_json::from_str(&peek(&session_json, 2)).unwrap();
        let cards: Vec<&str> = out["cards"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(cards, vec!["gamma:1", "delta:1"]);

        // Peeking again from the same original session_json yields the same
        // result, proving peek never mutated the session it was given.
        let out_again: serde_json::Value = serde_json::from_str(&peek(&session_json, 2)).unwrap();
        assert_eq!(out_again["cards"], out["cards"]);
    }

    #[test]
    fn over_peek_returns_error() {
        let session_json = fresh_session_json();
        let out: serde_json::Value = serde_json::from_str(&peek(&session_json, 5)).unwrap();
        assert!(out["error"].is_string());
    }

    #[test]
    fn shuffle_same_seed_is_identical() {
        let session_json = fresh_session_json();
        let a: serde_json::Value = serde_json::from_str(&shuffle(&session_json, 42)).unwrap();
        let b: serde_json::Value = serde_json::from_str(&shuffle(&session_json, 42)).unwrap();
        assert_eq!(a["containers"]["draw_pile"], b["containers"]["draw_pile"]);
    }

    #[test]
    fn shuffle_different_seeds_differ() {
        // Seeds 1 and 2 verified (by running this test) to produce different
        // orders for this 4-card deck.
        let session_json = fresh_session_json();
        let a: serde_json::Value = serde_json::from_str(&shuffle(&session_json, 1)).unwrap();
        let b: serde_json::Value = serde_json::from_str(&shuffle(&session_json, 2)).unwrap();
        assert_ne!(a["containers"]["draw_pile"], b["containers"]["draw_pile"]);
    }
}
