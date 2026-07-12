// ABOUTME: WASM bindings exposing deckbox-core parsing and validation to the
// ABOUTME: Deck Forge webui. All I/O is JSON strings.

use deckbox_core::DeckDefinition;
use serde_json::json;
use wasm_bindgen::prelude::wasm_bindgen;

const DECK_FIELDS: &[&str] = &["name", "description", "containers", "cards"];
const CARD_FIELDS: &[&str] = &["id", "title", "text", "count", "metadata"];

/// Parse deck YAML into a JSON envelope for the editor.
///
/// Deserializes directly (not through `DeckDefinition::from_yaml`, which also
/// validates) so decks that break engine validation rules still parse as
/// `ok:true` — the editor surfaces those problems separately.
#[wasm_bindgen]
pub fn parse_deck(yaml: &str) -> String {
    let deck: DeckDefinition = match serde_yaml_ng::from_str(yaml) {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e.to_string() }).to_string(),
    };
    let value: serde_yaml_ng::Value = serde_yaml_ng::from_str(yaml).unwrap_or_default();
    json!({
        "ok": true,
        "deck": deck,
        "saw_comments": saw_comments(yaml),
        "dropped_keys": dropped_keys(&value),
    })
    .to_string()
}

/// True if any line has a `#` comment: a full-line comment, or a `#`
/// preceded by a space outside single/double-quoted scalars.
///
/// This is a per-line text scan, not a YAML parser: an apostrophe in an
/// *unquoted* scalar (`text: it's fine # note`) is read as opening a
/// single-quoted span, so a trailing comment after it can be missed. Real
/// decks quote scalars containing apostrophes, so this doesn't come up in
/// practice, but it's a known gap in the heuristic.
fn saw_comments(yaml: &str) -> bool {
    yaml.lines().any(line_has_comment)
}

fn line_has_comment(line: &str) -> bool {
    if line.trim_start().starts_with('#') {
        return true;
    }
    let mut in_single = false;
    let mut in_double = false;
    let mut prev = ' ';
    for c in line.chars() {
        match c {
            '\'' if !in_double => in_single = !in_single,
            '"' if !in_single => in_double = !in_double,
            '#' if !in_single && !in_double && prev == ' ' => return true,
            _ => {}
        }
        prev = c;
    }
    false
}

/// Validate deck YAML against deckbox-core's engine rules.
#[wasm_bindgen]
pub fn validate_deck(yaml: &str) -> String {
    match DeckDefinition::from_yaml(yaml) {
        Ok(_) => json!({ "valid": true }).to_string(),
        Err(e) => json!({ "valid": false, "error": e.to_string() }).to_string(),
    }
}

/// Unknown keys at deck level, plus `cards[].`-prefixed unknown keys seen on
/// any card (deduplicated), found by diffing the raw parse against the known
/// field names — independent of what `DeckDefinition` itself deserializes.
fn dropped_keys(value: &serde_yaml_ng::Value) -> Vec<String> {
    let mut dropped = Vec::new();
    let Some(mapping) = value.as_mapping() else {
        return dropped;
    };
    for key in mapping.keys().filter_map(|k| k.as_str()) {
        if !DECK_FIELDS.contains(&key) {
            dropped.push(key.to_string());
        }
    }
    if let Some(cards) = mapping.get("cards").and_then(|v| v.as_sequence()) {
        let mut seen = std::collections::HashSet::new();
        for card in cards.iter().filter_map(|c| c.as_mapping()) {
            for key in card.keys().filter_map(|k| k.as_str()) {
                if !CARD_FIELDS.contains(&key) && seen.insert(key) {
                    dropped.push(format!("cards[].{key}"));
                }
            }
        }
    }
    dropped
}

#[cfg(test)]
mod tests {
    use super::*;

    const ORACLE_YAML: &str = r#"
name: "Crossroads Oracle"
description: "An encounter oracle for solo play."
containers:
  - discard

cards:
  # Threats
  - id: gathering-storm
    text: "Tension has been building unseen."
  - id: old-grudge
    text: "Someone here remembers a slight."
"#;

    #[test]
    fn parse_deck_clean_yaml_returns_ok_with_deck() {
        let out: serde_json::Value = serde_json::from_str(&parse_deck(ORACLE_YAML)).unwrap();
        assert_eq!(out["ok"].as_bool(), Some(true));
        assert_eq!(out["deck"]["name"].as_str(), Some("Crossroads Oracle"));
        assert_eq!(out["deck"]["cards"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn parse_deck_parses_example_oracle_cleanly() {
        let yaml = include_str!("../../examples/oracle.yaml");
        let out: serde_json::Value = serde_json::from_str(&parse_deck(yaml)).unwrap();
        assert_eq!(out["ok"].as_bool(), Some(true));
        assert_eq!(out["deck"]["name"].as_str(), Some("Crossroads Oracle"));
        assert_eq!(out["deck"]["cards"].as_array().unwrap().len(), 25);
        assert_eq!(out["saw_comments"].as_bool(), Some(true));
        assert_eq!(out["dropped_keys"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn parse_deck_reports_full_line_comment() {
        // ORACLE_YAML has a "# Threats" full-line comment above the cards.
        let out: serde_json::Value = serde_json::from_str(&parse_deck(ORACLE_YAML)).unwrap();
        assert_eq!(out["saw_comments"].as_bool(), Some(true));
    }

    #[test]
    fn parse_deck_no_unknown_keys_reports_empty_dropped_keys() {
        let out: serde_json::Value = serde_json::from_str(&parse_deck(ORACLE_YAML)).unwrap();
        assert_eq!(out["dropped_keys"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn parse_deck_quoted_hash_is_not_a_comment() {
        let yaml = r#"
name: "No Comments Here"
cards:
  - id: card-one
    text: "Roll a d6 and add 1 #trivia: not a comment"
"#;
        let out: serde_json::Value = serde_json::from_str(&parse_deck(yaml)).unwrap();
        assert_eq!(out["ok"].as_bool(), Some(true));
        assert_eq!(out["saw_comments"].as_bool(), Some(false));
    }

    #[test]
    fn parse_deck_quoted_hash_in_single_quoted_scalar_is_not_a_comment() {
        let yaml = r#"
name: "No Comments Here"
cards:
  - id: card-one
    text: 'Roll a d6 and add 1 #trivia: not a comment'
"#;
        let out: serde_json::Value = serde_json::from_str(&parse_deck(yaml)).unwrap();
        assert_eq!(out["ok"].as_bool(), Some(true));
        assert_eq!(out["saw_comments"].as_bool(), Some(false));
    }

    #[test]
    fn parse_deck_trailing_comment_outside_quotes_is_detected() {
        let yaml = r#"
name: "Trailing Comment"
cards:
  - id: card-one
    text: "First card" # trailing note
"#;
        let out: serde_json::Value = serde_json::from_str(&parse_deck(yaml)).unwrap();
        assert_eq!(out["saw_comments"].as_bool(), Some(true));
    }

    #[test]
    fn parse_deck_engine_invalid_duplicate_ids_still_parses_ok() {
        // parse_deck only deserializes; it must not run DeckDefinition's
        // (private) validate(), so an engine-invalid deck still parses.
        let yaml = r#"
name: "Duplicate Deck"
cards:
  - id: dupe
    text: "First"
  - id: dupe
    text: "Second"
"#;
        let out: serde_json::Value = serde_json::from_str(&parse_deck(yaml)).unwrap();
        assert_eq!(out["ok"].as_bool(), Some(true));
        assert_eq!(out["deck"]["cards"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn parse_deck_reports_unknown_top_level_and_card_keys() {
        let yaml = r#"
name: "Unknown Keys"
extra_field: "surprise"
cards:
  - id: card-one
    text: "First card"
    bogus: "nope"
"#;
        let out: serde_json::Value = serde_json::from_str(&parse_deck(yaml)).unwrap();
        assert_eq!(out["ok"].as_bool(), Some(true));
        let dropped: Vec<&str> = out["dropped_keys"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert!(dropped.contains(&"extra_field"));
        assert!(dropped.contains(&"cards[].bogus"));
    }

    #[test]
    fn parse_deck_malformed_yaml_returns_ok_false() {
        let out: serde_json::Value =
            serde_json::from_str(&parse_deck("not: valid: yaml: [")).unwrap();
        assert_eq!(out["ok"].as_bool(), Some(false));
        assert!(out["error"].is_string());
    }

    #[test]
    fn parse_deck_missing_required_field_returns_ok_false() {
        let out: serde_json::Value = serde_json::from_str(&parse_deck("cards: []\n")).unwrap();
        assert_eq!(out["ok"].as_bool(), Some(false));
        assert!(out["error"].is_string());
    }

    #[test]
    fn validate_deck_valid_deck_reports_valid() {
        let out: serde_json::Value = serde_json::from_str(&validate_deck(ORACLE_YAML)).unwrap();
        assert_eq!(out["valid"].as_bool(), Some(true));
    }

    fn assert_invalid(yaml: &str, expected_substring: &str) {
        let out: serde_json::Value = serde_json::from_str(&validate_deck(yaml)).unwrap();
        assert_eq!(out["valid"].as_bool(), Some(false));
        let error = out["error"].as_str().unwrap();
        assert!(
            error.contains(expected_substring),
            "expected error to contain '{expected_substring}', got: {error}"
        );
    }

    #[test]
    fn validate_deck_rejects_empty_cards() {
        assert_invalid("name: \"Empty Deck\"\ncards: []\n", "empty");
    }

    #[test]
    fn validate_deck_rejects_duplicate_ids() {
        let yaml = "name: \"Bad Deck\"\ncards:\n  - id: dupe\n    text: \"First\"\n  - id: dupe\n    text: \"Second\"\n";
        assert_invalid(yaml, "duplicate card ID: dupe");
    }

    #[test]
    fn validate_deck_rejects_zero_count() {
        let yaml = "name: \"Bad Deck\"\ncards:\n  - id: ghost\n    text: \"Gone\"\n    count: 0\n";
        assert_invalid(yaml, "count of 0");
    }

    #[test]
    fn validate_deck_rejects_reserved_container_name() {
        let yaml = "name: \"Bad Deck\"\ncontainers:\n  - draw_pile\ncards:\n  - id: card\n    text: \"A card\"\n";
        assert_invalid(yaml, "draw_pile");
    }

    #[test]
    fn validate_deck_rejects_card_id_with_colon() {
        let yaml = "name: \"Bad Deck\"\ncards:\n  - id: \"bad:id\"\n    text: \"Colon\"\n";
        assert_invalid(yaml, "colon");
    }

    #[test]
    fn validate_deck_malformed_yaml_carries_yaml_error() {
        let out: serde_json::Value =
            serde_json::from_str(&validate_deck("not: valid: yaml: [")).unwrap();
        assert_eq!(out["valid"].as_bool(), Some(false));
        assert!(out["error"].is_string());
    }
}
