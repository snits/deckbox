# Deckbox

A Rust library and CLI for managing decks of cards with draw-without-replacement semantics. Designed for TTRPG oracle decks, game-specific decks (e.g., Mappa Mundi), and any scenario where you need to track a physical deck of cards digitally.

Deckbox is a generic, semantics-free engine — it tracks cards and containers. Game rules and meaning live at the application level.

## Concepts

**Deck Definition** — A YAML file describing the cards in a deck. This is a template, not mutable state.

**Session** — A named, persistent instance of a deck definition. Tracks which cards are in which containers. All sessions are saved automatically after each operation.

**Containers** — Named groups that hold cards. Every session starts with a `draw_pile` containing all cards. You can define additional containers (like `discard`) in the definition, and new containers are created automatically when you move cards to them.

**Instance IDs** — Each physical card gets a unique ID. A card defined with `count: 3` produces instances `card-name:1`, `card-name:2`, `card-name:3`. This lets you track individual copies.

## Deck Definition Format

Deck definitions are YAML files:

```yaml
name: "Fate Oracle"
description: "Draw to reveal what fate has in store"
containers:
  - discard

cards:
  - id: goblin-ambush
    name: "Goblin Ambush"
    text: "A band of goblins leaps from the bushes!"
    count: 3
  - id: dragon-sighting
    name: "Dragon Sighting"
    text: "A shadow passes overhead..."
  - id: ancient-ruins
    name: "Ancient Ruins"
    text: "You stumble upon crumbling stone walls..."
    metadata:
      category: exploration
      image: ancient-ruins.png
```

### Card Fields

| Field      | Required | Description                                                |
|------------|----------|------------------------------------------------------------|
| `id`       | Yes      | Unique identifier within the deck. Duplicate IDs are an error. |
| `name`     | No       | Human-facing display name. Falls back to `id` if omitted.  |
| `text`     | Yes      | Card content (oracle prompt, flavor text, description).    |
| `count`    | No       | Number of copies in the deck (defaults to 1). Must be > 0. |
| `metadata` | No       | Arbitrary key-value properties (image ref, category, etc.) |

### Deck Fields

| Field         | Required | Description                                                    |
|---------------|----------|----------------------------------------------------------------|
| `name`        | Yes      | Human-readable deck name.                                      |
| `description` | No       | Deck description.                                              |
| `cards`       | Yes      | List of card definitions.                                      |
| `containers`  | No       | Additional containers beyond the default `draw_pile`. The name `draw_pile` is reserved and cannot be used here. |

## Examples

The `examples/` directory contains deck definitions you can try immediately:

- **`poker.yaml`** — Standard 52-card deck. Shows how deckbox models traditional card games — it tracks where cards are, while game rules live in your application.
- **`oracle.yaml`** — A solo RPG encounter oracle. Draw a card for narrative inspiration. This is deckbox's primary use case.

Quick start:

```bash
deckbox new examples/poker.yaml poker --shuffle
deckbox draw poker --count 5 --to hand
deckbox list poker
```

## CLI Usage

### Create a Session

```bash
deckbox new ~/decks/oracle.yaml tuesday
deckbox new ~/decks/oracle.yaml tuesday --shuffle
```

### Draw Cards

```bash
deckbox draw tuesday                              # 1 card from draw_pile to drawn
deckbox draw tuesday --count 3                    # 3 cards
deckbox draw tuesday --from encounters --to hand  # between specific containers
```

### Move Cards

```bash
deckbox move tuesday --cards goblin-ambush:1 --from hand --to discard
deckbox move-all tuesday --from discard --to draw_pile
```

### Shuffle

```bash
deckbox shuffle tuesday                           # shuffle draw_pile
deckbox shuffle tuesday --container discard        # shuffle specific container
```

### Peek

```bash
deckbox peek tuesday                              # top 1 card of draw_pile
deckbox peek tuesday --count 3                    # top 3 cards
```

### List

```bash
deckbox list tuesday                              # all containers and card counts
deckbox list tuesday --container hand             # cards in a specific container
```

### Reset and Sessions

```bash
deckbox reset tuesday                             # rebuild from definition
deckbox sessions                                  # list all saved sessions
```

## Session Storage

Sessions are saved to `~/.local/share/deckbox/sessions/<name>.yaml` (following XDG conventions on Linux) or `~/Library/Application Support/deckbox/sessions/` on macOS.

Set `DECKBOX_DATA_DIR` to override the storage location:

```bash
DECKBOX_DATA_DIR=/path/to/data deckbox new deck.yaml my-session
```

When set, sessions are stored at `$DECKBOX_DATA_DIR/sessions/`.

When loading a session, deckbox compares the current deck definition against the card IDs stored at session creation. If cards have been added or removed from the definition, a warning is printed. Use `deckbox reset <session>` to rebuild the session from the updated definition.

## Building

```bash
cargo build --release
```

The binary is at `target/release/deckbox`.

## Testing

```bash
cargo test
```

## License

MIT
