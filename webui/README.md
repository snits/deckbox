# Deck Forge

Browser editor for building deckbox decks — author cards in a form UI, preview
the emitted YAML, and validate and draw against the real deckbox engine.

## Prerequisites

- Node.js (developed against v22)
- Rust toolchain + [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) (`cargo install wasm-pack`) — builds `deckbox-wasm` to WebAssembly

## Setup

```bash
cd webui
npm install
```

## Development

```bash
npm run dev          # build:wasm, then start the Vite dev server
```

## Testing

```bash
npm test             # build:wasm, then vitest: unit and component tests
npm run test:watch   # vitest in watch mode
```

`npm test` builds the wasm package first (via `pretest`), but the tests
themselves never load it: `tests/engine.test.tsx` exercises `wrapEngine`
against a fake `RawEngine` under jsdom.

## Build

```bash
npm run build         # build:wasm, then tsc -b, then vite build
npm run lint           # oxlint
```

## Architecture

- **`deckbox-wasm`** (`../deckbox-wasm`) — wraps `deckbox-core` with
  `wasm-bindgen`, exposing JSON-string functions: `parse_deck`,
  `validate_deck`, `new_session`, `draw`, `peek`, `shuffle`. Built by
  `npm run build:wasm` into `src/wasm/pkg/` (gitignored, regenerated on every
  `dev`/`build`/`test`).
- **`src/engine/engine.ts`** — wraps the raw wasm module: parses its JSON
  envelopes and maps snake_case fields to camelCase. `wrapEngine` is
  factored out from `initEngine` so it's testable without loading WASM.
- **`src/engine/useEngine.tsx`** — `EngineProvider` loads the real engine on
  mount, or uses an injected engine (for tests); `useEngine()` reads it from
  context.
