# Handoff: Deck Forge — deckbox deck definition editor

## Overview
**Deck Forge** is a web app for authoring **deckbox** deck definition YAML files — the card decks (TTRPG oracle decks, prototype game decks) that the deckbox Rust library/CLI manages with draw-without-replacement semantics. A user builds decks visually (cards with id / title / text / count / metadata, plus extra containers), watches the emitted YAML live, sees validation that mirrors the engine's rules, and test-draws from an ephemeral session before downloading the `.yaml`.

It is the sibling of **Table Forge** (fatescroll's collection editor — see `fatescroll/docs/design/table-forge/`): the same three-pane IDE shape — **deck list (left) · editor (center) · YAML + validation + test-draw (right)** — wrapped in a "cartomancer's table" visual theme (candle-lit plum velvet, ivory card faces, antique gold) instead of Table Forge's parchment scriptorium.

## About the Design Files
`Deck Forge.dc.html` is a **design reference created in HTML** — a working prototype showing intended look, layout, and behavior. It is **not production code to copy directly.** Its markup uses `<x-dc>`, `<sc-for>`, `<sc-if>`, and `{{ … }}` template holes, and its logic lives in `class Component extends DCLogic`; `support.js` is the prototyping runtime, not something to ship. Recreate the design in the target codebase's environment (React, Vue, Svelte, …). The state shape and algorithms in the logic class are directly portable; the template syntax is not.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final; the data model, clean-YAML emitter, subset parser, validation, and draw-simulation logic are the real intended behavior — port them faithfully.

## Scope line (deliberate)
Authoring + **ephemeral** test-draw only. No persistent sessions, no card-moving between containers, no play surface — that is the companion iOS app's territory. User-defined containers appear in the test-draw summary but stay at zero.

---

## Layout
- Full-viewport flex column; header bar (~52px); body = horizontal flex:
  - Left rail (THE CABINET) — `flex: 0 0 252px`
  - Center (deck editor) — `flex: 1`, scrollable, content `max-width: 700px` centered
  - Right pane — `flex: 0 0 424px`
- Page bg `#241a2f` with two radial glows: warm candle `rgba(255,190,120,.09)` top-left, violet `rgba(110,70,150,.16)` bottom-right — plus a subtle felt grain (`radial-gradient(rgba(255,245,225,.02) 1px, transparent 1.4px)`, 4px tile).
- Base text `#e9e0d0`, `Spectral, Georgia, serif`, 15px.

## Header
Bg `#1c1426`, bottom border `3px double #a8862e`. Brand block: "Deckbox" in `Cormorant SC` 25px `#e6c86e`, "DECK FORGE" 11px letter-spacing 4px `#9c8253`. Divider 1×34px `#4a3a5c`. Active-deck block: tiny uppercase "DECK" label `#8d7ba6`, name 16px `#f0e8d8` (hidden when no deck selected). Spacer. **Status pill** (hidden when no deck): valid → teal (dot `#5fb3a1` glow, border `#3f7d74`, bg `rgba(63,125,116,.16)`, text "Deck is valid"); invalid → red (dot `#d97a58`, border `#8f3a28`, "N problem(s)").

## Left rail — THE CABINET
Bg `#2b2138`, right border `#4a3a5c`. Header label `Cormorant SC` 13px ls 2.5px `#a48cc4`. Deck rows: name (ellipsized) + `unique/total` count in mono 10px + hover-revealed ✕ delete. Selected: bg `#3d2f4e`, left accent `3px solid #c9a227`, name `#f0e4c8` 600. Dashed full-width buttons: "+ new deck", "⤴ import .yaml" (hidden file input; the rail is also a drag-drop target). Banners above the list: import error (red, dismissible — "Couldn't import <file>: <reason>"; no half-populated deck is created) and import notice (gold — comments won't be kept / unrecognized keys dropped).

**Deck deletion:** confirm dialog ("Delete “<name>”? This can't be undone."), then select next remaining deck or empty state.

## Center — states
- **Empty:** centered **gilt card-back motif** — 76×108px rounded card, gold border with inner gilt ring (`box-shadow: inset 0 0 0 3px #2b2138, inset 0 0 0 4px rgba(201,162,39,.55)`), diagonal gold hatching (`repeating-linear-gradient(45deg, rgba(201,162,39,.13) 0 6px, transparent 6px 12px)` on `#3d2f4e`), centered `☾` crescent 30px `#c9a227` — above a `Cormorant SC` heading. Two variants: "Nothing selected" (decks exist) / "The cabinet is empty" + create-or-import helper (zero decks, first-run).
- **Deck editor:** Deck name (large `Cormorant SC` 20px input), Description (optional). **CONTAINERS** section (note: "draw_pile is implicit"; rows = mono input + ✕; a row named `draw_pile` gets a red border AND a validation error). **CARDS** section: header shows `N unique · M total instances`, a filter input (matches id/title/text), and gold "+ card".

### Card rows (the signature element)
Each card is an **ivory card face** on the velvet table: bg `#f5eddc`, border `1px solid #c9b384`, inner gilt hairline (`box-shadow: inset 0 0 0 2px #f5eddc, inset 0 0 0 3px rgba(168,134,46,.4)`), radius 4px, shadow `0 2px 6px rgba(10,5,20,.35)`. Erroneous card → border `#c0452f`.
- **Collapsed row** (click toggles): drag handle ☰ (grab cursor; HTML5 drag reorder onto sibling rows) + ▲/▼ keyboard-accessible reorder buttons + mono **id chip** (`#efe2c2` bg; error state red) + italic title/text preview (ellipsized) + `N copies` pill — **shown only when count > 1** (✕ is reserved for destructive actions).
- **Expanded body:** grid `1fr 1fr 108px` of id (mono) / Title (optional) / Copies (positive-integer number input); Text textarea; **Metadata** key/value mono rows (+ add, ✕ remove; duplicate key → red key input + validation entry; empty-key rows dropped on emit); footer: "+ metadata", spacer, "⧉ duplicate" (copies card, id gets `-copy` suffix), "✕ remove card" (confirm).

**Card order matters:** it is preserved in YAML and defines unshuffled draw order (see draw semantics).

## Right pane
Bg `#2b2138`, left border `#4a3a5c`.
- **YAML:** section title = `<slug>.YAML`; ⧉ copy (label → "✓ copied" for 1.4s) and ⬇ .yaml (downloads `<slug>.yaml`; slug = name lowercased, non-alphanumerics → `-`). Dark viewer `#171021`, `JetBrains Mono` 12px `#d6c39a`, live re-emitted on every edit.
- **No-deck state:** YAML box shows `# no deck selected`; copy/⬇ buttons are hidden; VALIDATION and DRAW THE CARDS are replaced by a single italic placeholder "— select a deck to validate and test-draw —".
- **VALIDATION:** subtitle "deckbox rules + editor checks". Valid → teal `✓ Deck is valid.` Else red mono `✕` rows, one per problem. Inline field borders stay in sync with this list.
- **DRAW THE CARDS** (subtitle "ephemeral session"): gold **⤴ Draw** + N stepper + **◉ Peek** + **⇄ Shuffle** + **↺ Reset**; pile chips (`draw_pile` first, then alphabetical — `drawn` appears after first draw; user containers stay 0); output panel where drawn cards **accumulate** (gold `Cormorant SC` title + mono instance id + text; peek rows show an italic violet "peek —" title and move nothing). Empty-pile: Draw disables + hint "pile empty — reset to draw again". Engine-invalid deck: controls disable with hint "fix validation problems to test-draw".

---

## Data model (state shape)
```
decks:  [ { uid, name, desc, containers: [string], cards: [Card] } ]
selUid: uid | null
sess:   { piles: { draw_pile: [Inst], <container>: [Inst], drawn?: [Inst] } } | null
outRows:[ { title, iid, text, peek } ]
Card = { cid, id, title, text, count: string, meta: [ { mid, k, v } ], exp: bool }
Inst = { iid: '<id>:<n>', title, text }
```
- `count` stored as raw string, parsed on use; UI strips non-digits.
- Any deck edit invalidates the session (`sess = null`) and clears `outRows`.
- **Persistence:** whole workspace (`decks`, `selUid`) saved to localStorage key `deck-forge-workspace` after every mutation; loaded on start (seed example deck when absent); malformed persisted decks are dropped on load (validate per-deck/per-card shape incl. string fields and ids). The downloaded YAML is the source of truth; localStorage is working state.

## Core algorithms (port faithfully)

### Clean YAML emitter — NOT the engine's serializer
deckbox's serde output writes `null` for absent optionals and always writes `count`; do not mirror it. Emit hand-authored style the engine parses fine:
- `name`, then `description` only if set, then `containers:` block only if any non-empty, blank line, `cards:`.
- Card keys in order `id, title?, text, count?, metadata?`; omit `count` when 1; omit empty-key metadata rows; metadata in editor (insertion) order — the engine's HashMap has no stable order, the editor's order is canonical.
- `yv(s)` scalar quoting: double-quote when empty, leading/trailing whitespace, contains a newline (`\n`/`\r`), starts with a YAML indicator char, contains `:` followed by whitespace or end-of-string (a bare trailing colon is a mapping indicator — "Choose one:" must be quoted), contains ` #`, boolean/null-ish keyword, or numeric-looking; escape `\`, `"`, and newlines (`\n`→`\\n`, `\r`→`\\r`).

### Subset parser (import)
Line-based parser for the deck schema only: top-level `name` / `description` / `containers` / `cards`; card entries `- id: …` with nested keys and a `metadata:` map; single/double-quoted scalar unquoting. Tracks `sawComments` (full-line or trailing `#`) and `dropped` unknown keys → both surface in the import notice. Errors (line-numbered) for non-`key: value` content, missing `name`, missing/empty `cards`, card without `id`. **Round-trip is semantic, not textual.** (A production build may swap in a real YAML parser; keep the notice behavior.)

### Validation — engine rules + editor checks
Engine (mirror `deckbox-core` `Definition::validate()`): empty cards list · duplicate card ID · ID containing `:` (instance-ID conflict) · count of 0 · container named `draw_pile`. Editor checks (labeled "(editor check)" — the engine accepts these): empty id · empty text · duplicate metadata key. The editor lists ALL problems; the engine itself is fail-fast — the pill count is a deliberate editor superset.

### Draw simulation — mirror engine semantics
- Build: every card yields `count` instances `id:1..id:N`; all start in `draw_pile` **in definition order**; declared containers start empty.
- **Draw N:** clamp to remaining; take the chunk from the **END** of the pile (engine: `Vec::split_off(len - n)` — top of deck = end of list); append chunk to `drawn` (engine CLI's default destination, auto-created); display top-of-deck first.
- **Peek N:** last N, top-first, no movement. **Shuffle:** Fisher-Yates on `draw_pile`. **Reset:** rebuild from definition (definition order restored), clear output.

---

## Design tokens
**Fonts** (Google Fonts): `Cormorant SC` (display, 400/600/700) · `Spectral` (body serif) · `JetBrains Mono` (ids, YAML, counts).

**Colors**
- Velvet bg `#241a2f` (+ radial glows and felt grain above); panel `#2b2138`; header `#1c1426`; YAML `#171021` border `#3a2c4e`.
- On-dark text: primary `#e9e0d0`, muted lavender `#8d7ba6` / `#a48cc4`, faint `#6f5f88`; dark inputs bg `#1e1629` border `#55446b`, focus border gold.
- Gold: brand `#e6c86e`; accent/selection `#c9a227`; button `#8a6d1f` (hover `#a3821f`) border `#a8862e` text `#f7ecc8`; YAML text `#d6c39a`.
- Card faces: bg `#f5eddc`, border `#c9b384`, inner inputs `#fdf8ec` border `#d8c9a8`, ink `#3a2f2a` / `#4a3a2c`, muted `#9a875f`, id chip bg `#efe2c2` text `#7a5b23`.
- Teal (valid): `#3f7d74` / `#5fb3a1` / text `#8fc4b5`, bg tint `rgba(63,125,116,.16)`.
- Error red: `#c0452f`, on-dark `#e08a76`, chip `#a32c17` on `#f3ddd4`.
- `::selection` bg `#8a6d1f` text `#fdf6e0`.

**Radii:** 3px controls, 4px cards/panels, 10-11px pills/chips. **Borders of note:** header `3px double #a8862e`; selected deck row left `3px solid #c9a227`. **Scrollbars:** 11px, thumb `#4f3f66` inset-pill.

## Assets
No images. Unicode glyphs only: ☾ ☰ ▲ ▼ ✕ ⧉ ⬇ ✓ ⤴ ◉ ⇄ ↺.

## Files
- `Deck Forge.dc.html` — complete design + portable logic (template in `<x-dc>`; state, emitter, parser, validation, draw sim in `class Component`).
- `support.js` — prototyping runtime (reference only; do not ship).

Source of truth for engine semantics: `deckbox` repo — `deckbox-core/src/definition.rs` (`validate()`), `operations.rs` (draw/peek from end), `session.rs` (instance IDs, initial pile), CLI default draw destination `drawn`.
