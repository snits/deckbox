# Deckbox Design Spec

A Rust library and CLI for managing decks of cards with draw-without-replacement semantics. Primary use case: TTRPG oracle decks and game-specific decks (e.g., Mappa Mundi). Designed as a generic, semantics-free engine that tracks cards and containers — game rules and meaning live at the application level.

## Data Model

### Card Definition (from YAML)

| Field      | Type                              | Required | Description                                      |
|------------|-----------------------------------|----------|--------------------------------------------------|
| `id`       | `String`                          | Yes      | Unique within the deck definition. Duplicate IDs are a validation error. |
| `text`     | `String`                          | Yes      | Display text for the card                        |
| `count`    | `Option<u32>`                     | No       | Number of copies in the deck (defaults to 1). A count of 0 is a validation error. |
| `metadata` | `Option<HashMap<String, String>>` | No       | Arbitrary key-value properties (image ref, etc.) |

### Deck Definition (YAML file)

| Field         | Type                  | Required | Description                                        |
|---------------|-----------------------|----------|----------------------------------------------------|
| `name`        | `String`              | Yes      | Human-readable deck name                           |
| `description` | `Option<String>`      | No       | Deck description                                   |
| `cards`       | `Vec<CardDef>`        | Yes      | Card definitions                                   |
| `containers`  | `Option<Vec<String>>` | No       | Additional containers beyond the default `draw_pile`. Names colliding with `draw_pile` are a validation error. |

### Session (runtime state, serializable)

| Field             | Type                              | Description                              |
|-------------------|-----------------------------------|------------------------------------------|
| `name`            | `String`                          | User-provided session name               |
| `definition_path` | `PathBuf`                         | Path to the YAML definition file         |
| `containers`      | `HashMap<String, Vec<InstanceId>>` | Which cards are in which container       |
| `definition_cards` | `Vec<String>`                     | Card definition IDs at session creation time, for mismatch detection |

### Two-Level ID Scheme

- **Definition ID** (`goblin-ambush`) — identifies the card template, used to look up text and metadata
- **Instance ID** (`goblin-ambush:1`) — identifies a specific physical card in the session

When a session is created from a definition, each card with `count: N` produces N instances: `{id}:1`, `{id}:2`, ..., `{id}:N`. Cards with no count (or count 1) produce a single instance: `{id}:1`.

The engine operates on instance IDs. To resolve content (text, metadata), strip the suffix to get the definition ID and look it up in the definition.

### Example Deck Definition

```yaml
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
```

## Operations

### Session Lifecycle

| Operation      | Signature                                                     | Description                                                  |
|----------------|---------------------------------------------------------------|--------------------------------------------------------------|
| `create`       | `(name, definition_path, shuffle: bool) -> Result<Session>`   | Instantiate from definition, all cards in draw_pile          |
| `load`         | `(name) -> Result<(Session, Vec<Warning>)>`                   | Load saved session state from disk. Warnings include definition mismatches. |
| `save`         | `(session) -> Result<()>`                                     | Persist session state to disk                                |
| `reset`        | `(session) -> Result<Session>`                                | Rebuild from definition, all cards back to draw_pile         |

### Card Movement

| Operation    | Signature                                                   | Description                                       |
|--------------|-------------------------------------------------------------|---------------------------------------------------|
| `draw`       | `(from, to, count) -> Result<Vec<InstanceId>>`              | Take N cards from top of `from`, place in `to`    |
| `move_cards` | `(cards, from, to) -> Result<()>`                           | Move specific cards between containers            |
| `move_all`   | `(from, to) -> Result<()>`                                  | Move all cards from one container to another      |

### Container Operations

| Operation          | Signature                                    | Description                                    |
|--------------------|----------------------------------------------|------------------------------------------------|
| `shuffle`          | `(container) -> Result<()>`                  | Fisher-Yates shuffle of a container            |
| `peek`             | `(container, count) -> Result<Vec<InstanceId>>` | Look at top N cards without moving them     |
| `list`             | `(container) -> Result<Vec<InstanceId>>`     | List all cards in a container                  |
| `create_container` | `(name) -> Result<()>`                       | Add a named container at runtime. Also called implicitly — any operation referencing a nonexistent container as a destination auto-creates it. |

### Query

| Operation   | Signature                                   | Description                                    |
|-------------|---------------------------------------------|------------------------------------------------|
| `containers` | `() -> Vec<(String, usize)>`               | List all container names with their card counts |
| `remaining` | `(container) -> Result<usize>`              | How many cards are in a container              |
| `is_empty`  | `(container) -> Result<bool>`               | Whether a container has zero cards             |
| `find`      | `(instance_id) -> Result<Option<String>>`   | Which container holds this card                |
| `resolve`   | `(instance_id) -> Result<CardDef>`          | Get the definition for an instance             |

### Design Decisions

- `draw` takes from the "top" (end of the vec) of `from` and places cards into `to`. `shuffle` randomizes order. Draw order is meaningful — `peek` shows what you'd draw next.
- All mutating operations return enough info for the application to react.
- No container name is privileged — `draw_pile` and `drawn` are conventions. The engine treats all containers identically.
- Drawing from an empty container returns an error. The application decides how to react (reshuffle, warn user, etc.).
- Referencing a nonexistent container as a destination auto-creates it. Referencing a nonexistent container as a source is a `ContainerNotFound` error.

## Persistence

### File Layout

- **Deck definitions:** User-managed YAML files, stored wherever the user chooses.
- **Session state:** `~/.local/share/deckbox/sessions/{session-name}.yaml`

### Behavior

- Sessions are always named and persisted. State is saved after each operation.
- `reset` reloads the definition and rebuilds the session state.
- On load, the engine compares the definition's current card IDs against the `definition_cards` stored at session creation. Any additions or removals are surfaced as a non-fatal warning alongside the successfully loaded session. The user can `reset` to pick up definition changes. No automatic merging.
- Duplicate session names are an error.

## Architecture

### Crate Layout

```
deckbox/
├── Cargo.toml          # workspace with two members
├── deckbox-core/       # library crate
│   └── src/
│       ├── lib.rs
│       ├── definition.rs   # DeckDefinition, CardDef, YAML parsing
│       ├── session.rs      # Session, instance IDs, container state
│       ├── operations.rs   # draw, move, shuffle, peek, etc.
│       └── persistence.rs  # save/load session state
└── deckbox-cli/        # binary crate
    └── src/
        └── main.rs     # thin CLI over deckbox-core
```

### Core Library (`deckbox-core`)

- Pure logic, no I/O opinions. Persistence functions take readers/writers, not hardcoded file paths.
- The CLI decides *where* to save; the core decides *what* to save.
- All operations return `Result` types.

### CLI (`deckbox-cli`)

- Thin wrapper using `clap` for argument parsing.
- Subcommands generally map to core operations. `sessions` is CLI-only (lists files in the sessions directory).
- Handles file paths, XDG directories, terminal output formatting.

### Dependencies (MVP)

| Crate        | Purpose                    |
|--------------|----------------------------|
| `serde`      | Serialization framework    |
| `serde_yaml` | YAML parsing/writing       |
| `rand`       | Shuffle (Fisher-Yates)     |
| `clap`       | CLI argument parsing       |
| `thiserror`  | Error type derivation      |

### CLI Interface

```bash
# Session lifecycle
deckbox new ~/decks/oracle.yaml tuesday                # create named session
deckbox reset tuesday                                  # rebuild from definition
deckbox sessions                                       # list saved sessions

# Card operations (draw defaults: --from draw_pile --to drawn --count 1)
deckbox draw tuesday                                   # draw_pile -> drawn, 1 card
deckbox draw tuesday --count 3                         # draw 3 cards
deckbox draw tuesday --from encounters --to hand       # draw from/to specific containers
deckbox move tuesday --cards goblin-ambush:1 --from hand --to discard
deckbox move-all tuesday --from discard --to draw_pile

# Container operations
deckbox shuffle tuesday                                # shuffle draw_pile
deckbox shuffle tuesday --container discard            # shuffle specific container
deckbox peek tuesday --count 3                         # peek at top 3 (defaults to 1)

# Query
deckbox list tuesday                                   # all containers and counts
deckbox list tuesday --container hand                  # cards in specific container
```

## Error Handling

The core library defines a `DeckboxError` enum using `thiserror`:

| Variant              | Condition                                                         |
|----------------------|-------------------------------------------------------------------|
| `ContainerNotFound`  | Operation references a container that doesn't exist               |
| `CardNotFound`       | Move/find references an instance ID not in the expected container |
| `ContainerEmpty`     | Draw/peek on an empty container                                   |
| `NotEnoughCards`     | Draw/peek requests more cards than the container holds            |
| `SessionNotFound`    | Load/save can't find the session file                             |
| `DefinitionNotFound` | Session's definition path doesn't resolve                         |
| `DuplicateSession`   | Creating a session with a name that already exists                |
| `ValidationError`    | Definition content violates structural rules (duplicate IDs, zero count, reserved container names) |
| `ParseError`         | Malformed YAML in definition or session file                      |

The CLI maps these to user-friendly messages and appropriate exit codes.

## Not In Scope (YAGNI)

These are explicitly deferred. All can be added later without rewrites:

- Weighted or biased shuffle modes
- Engine-level triggers or event system
- Mutable per-card runtime state (face-up/face-down, damage counters)
- Cross-session card movement
- ECS entity-component architecture
- Ephemeral (unnamed/unsaved) sessions
- Web or GUI consumers
