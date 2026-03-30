# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Deckbox is a Rust library and CLI for managing decks of cards with draw-without-replacement semantics. It's a generic, semantics-free engine — it tracks cards and containers. Game rules and meaning live at the application level. Primary use case: TTRPG oracle decks.

## PROJECT SCALE CONTEXT

- **Users:** Single developer, personal CLI tool
- **Codebase:** Small (~1000 LOC), two-crate workspace
- **Complexity preference:** Simple, clean, minimal — no over-engineering
- **Process overhead:** Low — pragmatic approach, no CI/CD pipeline
- **Default approach:** Pragmatic

## Build & Test Commands

```bash
cargo build                           # Build everything
cargo test                            # Run all tests (unit + integration)
cargo test -p deckbox-core            # Core library tests only
cargo test -p deckbox-cli             # CLI integration tests only
cargo test -p deckbox-core -- operations::tests::draw_zero  # Single test
cargo test -p deckbox-core -- session::tests                # One module's tests
```

No linter or formatter is configured. The binary is `target/debug/deckbox` (or `target/release/deckbox`).

## Architecture

Rust workspace with two crates:

- **`deckbox-core`** — Library. All domain logic, no file I/O beyond `Read`/`Write` traits.
- **`deckbox-cli`** — Binary (`deckbox`). Thin clap wrapper over core. Owns file paths, session storage, user-facing output.

### Key Domain Concepts

**Definition vs Session split:** A `DeckDefinition` (YAML) is an immutable template. A `Session` is mutable runtime state tracking which cards are in which containers.

**Two-level ID scheme:** Definition IDs (`goblin-ambush`) identify card types for content lookup. Instance IDs (`goblin-ambush:1`, `goblin-ambush:2`) track individual copies. The `definition_id()` free function in `session.rs` extracts the definition ID via `rsplit_once(':')`.

**Containers:** Named `Vec<InstanceId>` groups. Every session starts with `draw_pile` (all cards) plus any containers declared in the definition. Unknown destination containers are auto-created on first reference by `draw` and `move_cards`. The top of a container is the last element (draw/peek take from the end).

**Persistence boundary:** `deckbox-core::persistence` takes `Read`/`Write` traits. The CLI owns the actual file paths (`~/.local/share/deckbox/sessions/<name>.yaml` on Linux, `~/Library/Application Support/deckbox/sessions/` on macOS). The `DECKBOX_DATA_DIR` env var overrides the base data directory. On load, the CLI compares current definition card IDs against stored `definition_cards` to detect mismatches.

### Module Responsibilities

| Module | Does | Does NOT |
|--------|------|----------|
| `definition.rs` | Parse + validate YAML deck definitions | Touch sessions or containers |
| `session.rs` | Create sessions, track container state, reset | Know about files or persistence |
| `operations.rs` | All mutations: draw, move, shuffle, peek, find, resolve | Read/write files |
| `persistence.rs` | Serialize/deserialize sessions, detect definition mismatches | Know about file paths |
| `error.rs` | `DeckboxError` enum + `Result` type alias | — |
| `main.rs` (CLI) | Clap parsing, file I/O, session storage, user output | Domain logic |

### Edge Case Behaviors

- `draw`/`peek` with `count=0` return empty vec without side effects (no container creation)
- `move_cards` with empty slice is a no-op (no container creation)
- `containers()` returns results sorted alphabetically

## Code Conventions

- All source files start with two `// ABOUTME:` comment lines explaining the file's purpose.
- `InstanceId` is a type alias for `String`, not a newtype.
- Sessions are serialized as YAML via serde.

## Issue Tracking

This project uses **bd (beads)** for issue tracking. See `AGENTS.md` for the full workflow. Use `bd ready` to find available work.
