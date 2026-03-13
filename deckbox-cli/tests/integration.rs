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

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "draw-test"])
        .output()
        .unwrap();

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
fn peek_shows_top_cards() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "peek-test"])
        .output()
        .unwrap();

    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["peek", "peek-test", "--count", "2"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    assert!(stdout.contains("Top 2 card(s)"));
}

#[test]
fn move_cards_between_containers() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "move-test"])
        .output()
        .unwrap();

    // Draw a card to know its instance ID
    let draw_output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["draw", "move-test", "--to", "hand"])
        .output()
        .unwrap();
    let draw_stdout = String::from_utf8_lossy(&draw_output.stdout);

    // Extract instance ID from output (format: "  id — text")
    let instance_id = draw_stdout.lines()
        .find(|l| l.contains(" — "))
        .and_then(|l| l.trim().split(" — ").next())
        .unwrap();

    // Move the card from hand to discard
    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["move", "move-test", "--cards", instance_id, "--from", "hand", "--to", "discard"])
        .output()
        .unwrap();

    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Moved 1 card(s)"));

    // Verify the card is in discard
    let list_output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["list", "move-test", "--container", "discard"])
        .output()
        .unwrap();
    let list_stdout = String::from_utf8_lossy(&list_output.stdout);
    assert!(list_stdout.contains(instance_id));
}

#[test]
fn list_specific_container() {
    let dir = TempDir::new().unwrap();
    let deck = create_test_deck(&dir);

    deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["new", deck.to_str().unwrap(), "listc-test"])
        .output()
        .unwrap();

    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["list", "listc-test", "--container", "draw_pile"])
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    assert!(stdout.contains("draw_pile"));
    assert!(stdout.contains("4 cards")); // 2 alpha + 1 beta + 1 gamma
    assert!(stdout.contains("alpha:1"));
}

#[test]
fn nonexistent_session_errors() {
    let dir = TempDir::new().unwrap();

    let output = deckbox()
        .env("XDG_DATA_HOME", dir.path())
        .args(["draw", "no-such-session"])
        .output()
        .unwrap();

    assert!(!output.status.success());
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
    assert!(stdout.contains("draw_pile"));

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
