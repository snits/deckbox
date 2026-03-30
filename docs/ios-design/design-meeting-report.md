# Design Meeting Report: SwiftUI iOS Frontend for Deckbox
Date: 2026-03-29
Participants: integration-arch (integration architecture), ux-design (UX/interaction design), plugin-arch (content/plugin architecture), ios-platform (iOS platform engineering)

## Executive Summary

The team reached strong consensus on a SwiftUI iOS app architecture for deckbox. The core decision: **reimplement deckbox-core in Swift** (~300-400 LOC of domain logic) rather than using Rust FFI. The app uses a `.deckbox` bundle format for third-party deck distribution (zip containing manifest.yaml + deck.yaml + images/), with Mappa Mundi shipping via asset catalog with synthesized metadata for production performance. Container presentation in v1 is a simple three-zone model (draw pile, drawn cards, container list) with no user customization.

## Consensus Items

### 1. Integration Architecture: Swift Reimplementation (Option C)
All four reviewers independently converged on this. The domain logic is ~300-400 LOC of HashMap/Vec manipulation with string IDs. FFI build system cost (cross-compilation, xcframework, Xcode build phases) far exceeds the one-time porting cost. The data model needs iOS adaptation anyway (`PathBuf` → bundle reference). Rust library stays as the canonical CLI tool; Swift port uses the Rust test suite (~50 tests) as a behavioral specification.

### 2. State Management: `@Observable` Class
Session state is a single `@Observable` class (`DeckSession`), not ObservableObject or struct. Operations mutate it in place. SwiftUI's Observation framework gives granular property-level tracking — drawing a card only re-renders views observing the affected containers. All mutations on `@MainActor`; auto-save snapshots on main, writes on background queue.

### 3. Persistence: YAML Definitions, JSON Sessions
- **Definitions**: YAML via Yams SPM dependency. YAML is the contract with deck creators and the CLI. YAML-only (no JSON alternative for definitions).
- **Sessions**: JSON via Codable. Sessions are internal app state, not user-authored. No cross-platform session sharing needed.
- **Storage**: Sessions in `Application Support/sessions/`. Bundles in `Application Support/decks/{bundle-id}/`.

### 4. Project Structure: Swift Package Hybrid
Same pattern as CardDeckManager but simpler:
```
DeckboxApp/
  DeckboxApp.xcodeproj         # Xcode owns — UI, assets, app config
  DeckboxApp/
    Views/                      # SwiftUI views
    Assets.xcassets             # Mappa Mundi images, app icon
  Packages/
    DeckboxKit/                 # Swift Package — agents work here
      Sources/DeckboxKit/
        Models/                 # DeckDefinition, CardDef, Session
        Engine/                 # Operations (draw, shuffle, etc.)
        Persistence/            # Load/save sessions and definitions
        Bundle/                 # .deckbox import, validation, manifest
      Tests/DeckboxKitTests/    # Ported from deckbox-core Rust tests
```

### 5. `.deckbox` Bundle Format
```
my-deck.deckbox (zip archive)
  manifest.yaml        # App-level metadata (NOT in deckbox-core)
  deck.yaml            # Standard deckbox definition (unchanged format)
  images/
    card-back.jpg      # Required card back image
    goblin-ambush.jpg  # Card images, filename matches card ID
    ...
```

**manifest.yaml schema:**
```yaml
format_version: 1
name: "Fate Oracle"
version: "1.0.0"
creator: "Jane Smith"
card_back: "images/card-back.jpg"
theme_color: "#4A6741"           # Optional accent color
image_directory: "images"
```

Image convention: `{card-id}.{jpg,png}` in the images directory. For cards where the ID doesn't match the filename, use `metadata.image` on the CardDef as override. Distribution via iOS UTType registration (`.deckbox` conforms to `.zip`) — opens from Files, AirDrop, share sheet.

### 6. Deckbox Definition Format Unchanged
No iOS-specific fields added to deckbox-core's YAML format. The manifest carries all app-level metadata (card back, theme color, creator attribution). This keeps the engine portable and the definition format identical between CLI and iOS.

### 7. Core UX: Draw Loop as Primary Interaction
Tap draw pile → card lifts (50ms) → 3D flip (300ms) → slides to drawn area (200ms) → settles with bounce. Total <600ms. This single interaction is 80% of the app. Cards displayed full-bleed — the artwork IS the UI element, no chrome overlaid. Haptic feedback on draw (light impact), shuffle (notification), and errors.

### 8. Auto-Save on Scene Phase
Critical for table use. Save session state on `.background` and `.inactive` scene phase changes. JSON serialization at this data size is sub-millisecond.

### 9. Undo Support
Snapshot `containers` dictionary before each operation. Use Swift's `UndoManager` integrated with SwiftUI. Cheap to implement (containers is just `[String: [String]]`), high value at the gaming table where accidental draws happen.

### 10. Don't Carry Forward CardDeckManager's Service Layer
The FileStorageService, JSONPersistenceService, validation framework, and protocol abstractions are over-engineered for deckbox. Start fresh. **Do** carry forward: Mappa Mundi card images from the asset catalog, and the lesson about .xcodeproj safety (hence the Package hybrid).

## Resolved Disagreements

### Tension 1: Card ID, Display Name, and Image Filename Convention
**Resolution: Add `name: Option<String>` to CardDef. Keep kebab-case IDs. Use `metadata.image` for explicit image paths.**

Late-meeting revision: the team converged on adding a `name` field to `CardDef` in deckbox-core before iOS work begins. Each field has one job:
- `id` — machine key, kebab-case slug, used in instance IDs (`aisha-kandisha:1`) and session serialization
- `name` — optional human-facing display label (`"Aisha Kandisha"`), falls back to `id` if absent
- `text` — card content, oracle meaning, flavor text (freed from double-duty as display name)

This is an additive, backward-compatible change to deckbox-core (one optional field). Existing YAML without `name` continues to work. The CLI benefits too — it can show `name` instead of `id` in user-facing output.

For image lookup: `metadata["image"]` is the explicit image path. Convenience fallback: `{card-id}.{ext}` in the images directory. For Mappa Mundi: images get kebab-case filenames matching card IDs during the one-time migration from CardDeckManager.

**Why not defer (original YAGNI call):** Mappa Mundi cards are image-based. If `text` is just the card name repeated, there's no field for oracle meaning or lore — which is exactly the rich content the iOS app should showcase. Adding `name` now across one codebase is cheaper than coordinating across two (Rust + Swift) later.

### Tension 2: Container Presentation in v1
**Resolution: Three-zone model, no user customization.**

- **Zone 1 — Draw pile**: Face-down stack with card back image, count badge, tap-to-draw. Visually prominent (center-to-bottom on iPhone for thumb reachability).
- **Zone 2 — Drawn cards**: Face-up cards in horizontal scroll or grid. Fixed default destination for draws. Shows card artwork at appreciable size.
- **Zone 3 — Other containers**: Labeled expandable list below/beside the main area. Each container shows name, count, and an auto-assigned accent color stripe (deterministic from name hash — no persistent state needed). Tap to expand and see contents.

No SF Symbol icons, no spatial drag-and-drop positioning, no user color customization in v1. All are additive features if real table usage proves they're needed.

### Tension 3: Mappa Mundi Packaging
**Resolution: Hybrid — asset catalog images + synthesized bundle metadata.**

1. Mappa Mundi card images ship in the **Xcode asset catalog** (compiled, optimized, instant load).
2. `deck.yaml` and `manifest.yaml` ship as **bundled app resources** (text files). On first launch, parsed through the standard definition/manifest code path. Mappa Mundi registered as an installed deck via the same deck management logic.
3. **Polymorphic image loading** behind a protocol: asset catalog for bundled decks, filesystem for imported `.deckbox` bundles. The engine layer doesn't know the difference.
4. A real `.deckbox` bundle of Mappa Mundi ships as a **test fixture** (not in production). Integration tests exercise the full import pipeline with real content. Also serves as the reference example for deck creators.

Why: Pure `.deckbox` means 98MB unzip + thumbnail generation on first launch (bad first impression). Pure asset catalog doesn't validate the definition parsing path. Hybrid gives production performance, real format validation, and full import pipeline testing.

## Open Questions

These items need human decision or further design before implementation:

1. **Card text rendering for non-image decks.** Deckbox supports text-only cards (no `metadata.image`). What does the text-card template look like? Large title, body text below, background color from metadata? This is a rendering design decision that affects the CardView component architecture.

2. **Multiple simultaneous active sessions.** A TTRPG GM might have two oracle decks in play (terrain + encounters). Should the app support switching between active sessions with a tab/swipe, or is one-deck-at-a-time sufficient for v1?

3. **Bundle update flow.** When a user re-imports an updated version of a deck they already have, what happens? Replace and warn about session mismatches? Install side-by-side? Reject? The deckbox mismatch detection provides the foundation, but the UX flow needs design.

4. **Definition path replacement in Session.** The Rust `Session.definition_path: PathBuf` needs to become a deck identifier (bundle ID or deck name) in the Swift port. How sessions reference their definition after import needs explicit design.

5. **Haptics and sound.** Team agrees haptics are day-one. Sound effects (card flip, shuffle riffle) — desired for v1 or deferred?

6. **iPad Split View / Slide Over.** The three-zone layout needs to degrade gracefully at compact horizontal size class. Design needed for 1/3-width iPad view.

7. **Accessibility depth.** Beyond labels: Dynamic Type for text cards, Reduce Motion (instant state changes instead of animations), VoiceOver rotor actions for draw/shuffle/move. Design these in from the start or add incrementally?

8. **`deckbox validate-bundle` CLI subcommand.** Adding bundle validation to the existing deckbox CLI would close the creator feedback loop. Worth building alongside the iOS app or after?

## Recommendations

### Implementation Order (suggested phases)

**Phase 1: Engine + Tests**
- Port deckbox-core to Swift as DeckboxKit package
- Port Rust test suite as behavioral specification
- Definition YAML parsing via Yams
- Session JSON persistence

**Phase 2: Core Draw Experience**
- Draw pile → flip animation → drawn cards area
- Basic session management (create, load, list, delete)
- Mappa Mundi as bundled first-party deck (asset catalog + YAML)
- Auto-save on scene phase
- Haptic feedback

**Phase 3: Bundle System**
- `.deckbox` UTType registration and import pipeline
- Manifest parsing and validation
- Thumbnail generation at import
- Polymorphic image loading (asset catalog vs filesystem)
- Bundle validation with clear error messages

**Phase 4: Polish**
- Undo support via UndoManager
- Container accent color stripes
- iPad layout adaptation
- Accessibility (Dynamic Type, Reduce Motion, VoiceOver)
- Text-only card rendering template
- Multiple simultaneous sessions (if needed)

### Key Architecture Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration | Swift reimplementation | ~400 LOC, FFI tax not justified, model needs adaptation |
| State | `@Observable` class | Granular updates, SwiftUI-idiomatic |
| Definitions | YAML via Yams | Creator-friendly, CLI parity |
| Sessions | JSON via Codable | Internal state, zero dependencies |
| Storage | No SwiftData | Sessions are small blobs, not relational |
| Project | Package hybrid | Agent safety, testability |
| Bundle format | `.deckbox` zip | UTType registration, share sheet, creator-friendly |
| Manifest | Separate from definition | Keeps engine portable |
| Mappa Mundi | Asset catalog + synthesized metadata | Performance + format validation |
| Container v1 | Three zones, no customization | Minimum viable, additive later |
| Card IDs | Kebab-case machine slugs | CLI compatibility, instance ID format |
| Display name | `name: Option<String>` on CardDef | Separates identity from content, enables rich text |
| Image mapping | `metadata.image` explicit + `{card-id}.{ext}` fallback | Explicit primary, convention as convenience |
