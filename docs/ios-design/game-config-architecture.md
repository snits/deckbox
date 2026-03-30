# Game Configuration Layer: Architecture Design

## Executive Summary

The game config layer is a declarative YAML section that lives inside the existing `manifest.yaml` file, under an optional `game` key. It tells the iOS app how to display containers, what behaviors to trigger on state changes, and what counters/trackers to show alongside cards. The deckbox engine stays untouched — the app reads game config and orchestrates engine calls accordingly.

The design philosophy: **the app is the interpreter, the config is the script, the engine is the tool.** Game config doesn't add logic to the engine — it tells the app what engine operations to chain together and how to present the results.

A deck with no `game` key works perfectly as a basic card sleeve (draw pile + drawn cards + containers list). Game config is purely additive.

## The File: Where Game Config Lives

**Extend `manifest.yaml` with an optional `game` key.** Don't create a separate file.

Rationale:
- The manifest already owns app-level concerns (theme color, card back, creator info). Container display and behavior are app-level concerns, not engine concerns.
- One less file for deck creators to manage. A typical game config adds 15-30 lines to the manifest.
- Clean namespace separation: top-level keys are bundle metadata, `game` subtree is gameplay configuration.
- If a deck has no gameplay customization, omit the `game` key entirely — zero overhead.

The manifest after this addition has three concern areas:
```yaml
# Bundle metadata (existing)
format_version: 1
name: "My Deck"
version: "1.0.0"
creator: "Jane Smith"
card_back: "images/card-back.jpg"
theme_color: "#4A6741"
image_directory: "images"

# Gameplay configuration (new, optional)
game:
  containers: { ... }
  state: { ... }
```

## Schema: Container Properties

Container config provides display hints and behavior triggers. Every property is optional — unconfigured containers use sensible defaults.

```yaml
game:
  containers:
    <container-name>:       # matches container name in deck.yaml or auto-created by engine
      label: "Display Name" # human-facing label (default: title-case of container name)
      face: down             # "up" or "down" — how cards display (default: up)
      drawable: true         # show as a tappable draw source in Zone 1 (default: false)
      draw_to: <container>   # where drawn cards land (default: general drawn area)
      show_top: true         # in list view, show top card face-up (default: false)
      on_empty:              # behavior when container empties
        recycle_from: <container>  # move_all + shuffle from this container
```

### Property details

**`label`** — Display name shown in the UI. Defaults to title-casing the container name (`draw_pile` → "Draw Pile", `active_creature` → "Active Creature"). Override when the default isn't meaningful.

**`face`** — Whether cards in this container display face-up (showing artwork/text) or face-down (showing card back). Default is `up` for all containers except `draw_pile`, which defaults to `down`. This matches how physical cards work: draw piles are face-down, everything else is face-up.

**`drawable`** — Marks a container as a draw source. `draw_pile` is always drawable (implicit). Setting `drawable: true` on another container (e.g., `creatures`) promotes it to Zone 1 in the UI — it appears as a tappable stack alongside the main draw pile. This extends the three-zone model: Zone 1 shows ALL drawable containers.

**`draw_to`** — When drawing from this container, where do drawn cards land? Default behavior places them in the general "drawn cards" area (Zone 2). Override to route draws to a specific container (e.g., creature draws go to `active_creature` instead of the general drawn area).

**`show_top`** — In the container list view (Zone 3), show the top card face-up as a preview. Useful for discard piles where seeing the last discarded card is meaningful. Default is `false` (just show container name and count).

**`on_empty.recycle_from`** — When a draw is attempted and this container is empty, automatically move all cards from the specified container back into this one, shuffle, then retry the draw. This is the standard "reshuffle discard into draw pile" pattern used by most TTRPG decks. If the recycle source is also empty, the app shows "no cards remaining."

### Containers not in config

Containers declared in `deck.yaml` or auto-created by the engine that have no entry in `game.containers` use all defaults: face up, not drawable, no behaviors. This means a deck with no game config at all renders every container with sensible defaults.

Containers referenced in game config that don't exist in `deck.yaml` are fine — the engine auto-creates containers on first use, and the app applies config properties when they appear.

### How the three-zone model adapts

| Zone | What goes here | Game config influence |
|------|---------------|----------------------|
| Zone 1 — Draw sources | `draw_pile` + any container with `drawable: true` | `drawable`, `label`, `face`, `draw_to` |
| Zone 2 — Drawn cards | Default draw destination + containers referenced by `draw_to` | `label`, `face` |
| Zone 3 — Other containers | Everything else | `label`, `face`, `show_top` |

## Schema: Card Rules

v1 keeps card interaction rules minimal. The most common TTRPG pattern beyond basic draw-and-reveal is the **draft** mechanic: reveal N cards, pick M, discard the rest. This is declared per draw source.

```yaml
game:
  draw_rules:
    - from: draw_pile        # which drawable container this applies to
      reveal: 3              # draw this many face-up for selection
      pick: 1                # player keeps this many
      rest_to: discard       # unpicked cards go here
```

### How draw rules work at runtime

Without draw rules, drawing is simple: tap a drawable container, one card moves to the destination, done.

With a draw rule:
1. App draws `reveal` cards from the source to a transient "reveal" zone
2. App displays all revealed cards face-up
3. Player taps `pick` cards to keep — these move to the configured `draw_to` destination (or general drawn area)
4. Remaining cards automatically move to `rest_to`

If `reveal` equals `pick`, there's no selection — all revealed cards are kept. This covers "draw 3" without selection.

### What's NOT in card rules

No conditional logic. No "if card has category X, do Y." No scripting. Cards have `metadata` in `deck.yaml` (key-value strings) which the app can use for display purposes (grouping, filtering, icons), but metadata doesn't trigger automated behaviors. The human interprets card meaning — the app just presents information.

## Schema: Game State (Counters/Trackers)

TTRPG oracle decks often track numeric values alongside cards: chaos factor, danger level, momentum, supply. These are **display-only counters** — the app renders them as stepper controls, and the human decides how cards interact with counter values.

```yaml
game:
  state:
    <tracker-name>:
      type: counter          # only type in v1
      label: "Chaos Factor"  # display name
      initial: 5             # starting value
      min: 1                 # floor (optional, default 0)
      max: 9                 # ceiling (optional, default unbounded)
```

### Design decision: no card-counter automation

It's tempting to add rules like "when chaos_factor >= 7, cards with `chaos_threshold: high` display differently." This crosses into scripting territory. The TTRPG table experience is: draw a card, glance at your chaos factor, interpret the combination. The app replicates this by showing both pieces of information — card content and counter values — and lets the human do the interpretation.

This keeps the format simple enough for non-developer deck creators and avoids the security/complexity trap of in-bundle logic execution.

### Counter persistence

Counter values are stored in the session alongside container state. When the session is saved (auto-save on scene phase change), counter values persist. When the session is reset, counters return to their `initial` values.

### Counter UI placement

Counters display in a persistent state bar (likely top of screen or in a collapsible panel). Each counter shows its label, current value, and +/- stepper controls. The state bar is visible during play so the player can reference values when interpreting drawn cards.

## Runtime Interpretation (How the App Uses This)

The game config is pure data. The app interprets it through a thin lookup layer.

### Architecture

```
manifest.yaml
    |  (parse)
    v
GameConfig (Swift struct)
    - containers: [String: ContainerConfig]
    - drawRules: [DrawRule]
    - state: [String: TrackerConfig]
    |
    v
GameBehavior (Swift class, ~50-100 LOC)
    - displayConfig(for container: String) -> ContainerDisplay
    - drawBehavior(from container: String) -> DrawBehavior
    - emptyAction(for container: String) -> EmptyAction?
    - trackers() -> [TrackerConfig]
    |
    v
DeckSession (engine) — receives plain operation calls
```

`GameBehavior` is the interpreter. It does NOT execute operations — it answers questions the UI layer asks:

- "How should I display the `discard` container?" → face up, show top card, label "Discard Pile"
- "User tapped `draw_pile`. What's the draw procedure?" → simple draw 1 to drawn area (or draft 3, pick 1, rest to discard)
- "`draw_pile` is empty. What now?" → recycle from discard, shuffle, retry
- "What counters should I show?" → chaos_factor (1-9, starts at 5), danger_level (0-10, starts at 0)

The **UI layer** (SwiftUI views) calls `GameBehavior` for decisions, then calls the engine for mutations. The flow for a draw with auto-recycle:

```
1. User taps draw pile
2. View asks GameBehavior: drawBehavior(from: "draw_pile") → .simple(to: "drawn")
3. View calls engine: draw(from: "draw_pile", to: "drawn", count: 1)
4. Engine returns ContainerEmpty error
5. View asks GameBehavior: emptyAction(for: "draw_pile") → .recycle(from: "discard")
6. View calls engine: moveAll(from: "discard", to: "draw_pile")
7. View calls engine: shuffle("draw_pile")
8. View retries: draw(from: "draw_pile", to: "drawn", count: 1)
9. If still empty → show "no cards remaining" alert
```

### What happens with no game config

If `manifest.yaml` has no `game` key, `GameBehavior` returns defaults for everything:
- `draw_pile`: face down, drawable, draws to general drawn area, no recycle
- All other containers: face up, not drawable, no behaviors
- No counters
- No draw rules

The app works perfectly as a simple card sleeve.

## Phasing: v1 Minimal vs Future

### v1 — Ship this

| Feature | Covers |
|---------|--------|
| `containers.{name}.label` | Human-readable container names |
| `containers.{name}.face` | Face-up vs face-down display |
| `containers.{name}.drawable` | Multiple draw sources (terrain + creatures) |
| `containers.{name}.draw_to` | Route draws to specific containers |
| `containers.{name}.on_empty.recycle_from` | Auto-reshuffle discard into draw pile |
| `state.{name}` with `type: counter` | Chaos factor, danger level, momentum |

This covers: Mappa Mundi (multiple draw sources, recycle, hex counter), Mythic GM Emulator (chaos factor counter, simple draws), generic tarot oracle (just defaults, no config needed), and most TTRPG oracle decks.

### v2 — Add when real usage demands it

| Feature | Use case | Why defer |
|---------|----------|-----------|
| `draw_rules` (draft mechanic) | Deck-builder style "reveal N, pick M" | Uncommon in oracle decks; adds UI complexity (selection modal) |
| `containers.{name}.show_top` | Discard pile preview | Nice-to-have; simple to add later |
| `containers.{name}.max_cards` | Hand size limits | Uncommon in oracle decks |
| `state.{name}` with `type: flag` | Boolean toggles (is_cursed, has_blessing) | Counters with min:0/max:1 work as booleans in v1 |
| Card category display grouping | Group drawn cards by metadata.category | Display logic, not game rules; add when visual clutter is a problem |
| Counter step size | Increment by values other than 1 | Edge case; default +1/-1 covers most trackers |
| Container sort/position hints | Explicit Zone 2/3 ordering | Alpha sort is fine for v1 |

### Non-goals (probably never)

- Conditional logic / scripting in YAML
- Card-counter automated interactions
- Timer/clock trackers
- Networked multiplayer state sync
- Custom UI layouts beyond the three-zone model

## Complete Example: Mappa Mundi Bundle

```
mappa-mundi.deckbox (zip)
  manifest.yaml
  deck.yaml
  images/
    card-back.jpg
    plains.jpg
    forest.jpg
    mountain.jpg
    goblin-ambush.jpg
    ...
```

### manifest.yaml

```yaml
format_version: 1
name: "Mappa Mundi"
version: "1.0.0"
creator: "Jerry"
card_back: "images/card-back.jpg"
theme_color: "#4A6741"
image_directory: "images"

game:
  containers:
    draw_pile:
      label: "Terrain Deck"
      face: down
      on_empty:
        recycle_from: discard
    creatures:
      label: "Creature Deck"
      face: down
      drawable: true
      draw_to: active_creature
    discard:
      label: "Discard"
      face: up
    active_creature:
      label: "Active Creature"
      face: up
  state:
    hexes_explored:
      type: counter
      label: "Hexes Explored"
      initial: 0
      min: 0
      max: 99
    danger_level:
      type: counter
      label: "Danger"
      initial: 0
      min: 0
      max: 10
```

### deck.yaml

```yaml
name: "Mappa Mundi"
description: "Terrain and creature cards for hex exploration"
containers:
  - discard
  - creatures
cards:
  - id: plains
    name: "Open Plains"
    text: "Flat grassland stretches to the horizon. Safe travel, good visibility."
    count: 8
    metadata:
      category: terrain
  - id: forest
    name: "Dense Forest"
    text: "Ancient trees block the sun. Navigation is difficult but resources are plentiful."
    count: 6
    metadata:
      category: terrain
  - id: mountain
    name: "Mountain Pass"
    text: "A narrow trail winds between peaks. Slow going but defensible."
    count: 4
    metadata:
      category: terrain
  - id: goblin-ambush
    name: "Goblin Ambush"
    text: "A band of goblins leaps from cover! They demand tribute or blood."
    count: 3
    metadata:
      category: creature
  - id: dragon-sighting
    name: "Dragon Sighting"
    text: "A shadow passes overhead. The earth trembles."
    count: 1
    metadata:
      category: creature
```

### How the app renders this

**Zone 1 (draw sources):** Two tappable stacks side by side — "Terrain Deck" (face-down, 71 cards) and "Creature Deck" (face-down, 4 cards). Each shows card-back image and count badge.

**Zone 2 (drawn cards):** When player taps Terrain Deck, card flips face-up and slides to drawn area showing "Open Plains" artwork. When player taps Creature Deck, card goes to the "Active Creature" container instead (shown as a highlighted single-card display).

**Zone 3 (other containers):** "Discard" (face-up, shows count), "Active Creature" (face-up, shows the creature card).

**State bar:** "Hexes Explored: 0" and "Danger: 0" with stepper controls. Player taps + after each terrain draw. When terrain suggests danger, player bumps Danger up.

**Auto-recycle:** When Terrain Deck empties, player taps it, app silently moves all discard back into Terrain Deck, shuffles, and draws. A subtle shuffle animation plays.

## Recommendations

1. **Start with container properties only for v1.** Label, face, drawable, draw_to, and on_empty cover the real use cases. Counters are simple to add but can wait for v1.1 if you want to ship the draw experience faster.

2. **Don't overthink the schema now.** This YAML format is internal to your bundles. You can version it (`format_version: 1` is already in the manifest). If you need to change the schema, bump the version and handle migration in the app.

3. **Validate game config at import time.** When a `.deckbox` bundle is imported, check that container names in game config match containers declared in `deck.yaml` (or are valid auto-create targets like `draw_to` destinations). Warn on typos early — this is the deck creator's feedback loop.

4. **Consider a `deckbox validate-bundle` CLI subcommand** (noted as open question in the design meeting). This would let deck creators validate their manifest + game config before distributing, without needing the iOS app.

5. **The `GameBehavior` interpreter should be in DeckboxKit** (the Swift package), not in the view layer. This keeps it testable and separates "what should happen" from "how it looks." Views ask GameBehavior questions; GameBehavior never touches UI.

6. **Counter state needs a home in the session model.** The Rust `Session` struct has `containers: HashMap<String, Vec<InstanceId>>`. The Swift `DeckSession` needs an additional `counters: [String: Int]` field in its JSON persistence. This is a Swift-only addition — the Rust engine doesn't know about counters.
