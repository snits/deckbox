# Evidence Log — kata z47y

Repository: `/home/jsnitsel/devel/deckbox` at `af099234a257`, 2026-07-14.

### E1 — [structural] issue scope
- **Claim:** Kata issue `z47y` is open and asks for image paths relative to the manifest directory while retaining absolute-path support.
- **Environment:** deckbox `main`, commit `af099234a257`.
- **Command / Source:** `kata show z47y --agent`
- **Output:** `Issue: z47y "allow relative paths for images"`; body: `Allow paths relative to the manifest. So either a absolute path or dirpath-of-manifest / relative-path-in-entry`.
- **Status:** confirmed

### E2 — [structural] current image resolution boundary
- **Claim:** `resolveImageSrc` currently passes bare relative values through, and `cardImageSrc` receives only a card and face.
- **Environment:** deckbox `main`, commit `af099234a257`.
- **Command / Source:** `nl -ba webui/src/logic/cardImage.ts`
- **Output:** `resolveImageSrc(value: string)` is at lines 13–17; line 16 returns `value` for non-URL, non-absolute input. `cardImageSrc(card: Card, face: CardFace)` is at lines 21–24 and calls `resolveImageSrc(value)` without a base path.
- **Status:** confirmed

### E3 — [structural] import path context is discarded
- **Claim:** The import flow passes only `file.name` and parsed text to `importYaml`; the resulting `Deck` has no manifest-directory field.
- **Environment:** deckbox `main`, commit `af099234a257`.
- **Command / Source:** `nl -ba webui/src/components/Cabinet.tsx | sed -n '58,81p'`; `nl -ba webui/src/import/importDeck.ts`; `nl -ba webui/src/model/types.ts`
- **Output:** `Cabinet.tsx:67` calls `importYaml(engine, file.name, String(reader.result ?? ''))`; `importDeck.ts:18` accepts `(engine, fileName, text)` and maps via `parsedToDeck`; `types.ts:20–26` defines `Deck` without manifest path context.
- **Status:** confirmed

### E4 — [structural] all image consumers share the same missing context
- **Claim:** Test-draw resolves both drawn front images and peeked back images through `cardImageSrc`.
- **Environment:** deckbox `main`, commit `af099234a257`.
- **Command / Source:** `nl -ba webui/src/components/TestDraw.tsx | sed -n '44,59p'`
- **Output:** `TestDraw.tsx:56` calls `cardImageSrc(card, peek ? 'back' : 'front')` while constructing each output row.
- **Status:** confirmed

### E5 — [dead-end] full graphify semantic extraction unavailable
- **Claim:** Full graphify extraction could not run because the environment has no configured LLM API key; deterministic code extraction remained available.
- **Environment:** deckbox working tree, 2026-07-14.
- **Command / Source:** `graphify extract . --max-workers 2 --max-concurrency 1`
- **Output:** `found 51 code, 19 docs, 0 papers, 0 images`; `error: no LLM API key found`.
- **Status:** dead-end
- **Notes:** `graphify update . --no-cluster` succeeded with `594 nodes, 1233 edges`; semantic document relationships are not used as evidence here.

### E6 — [causal] production import lacks a trustworthy manifest directory
- **Claim:** The current browser import path has no manifest-directory value to pass to image resolution.
- **Environment:** deckbox `codex/z47y-relative-image-paths`, 2026-07-14.
- **Command / Source:** `nl -ba webui/src/components/Cabinet.tsx | sed -n '58,81p'`; `nl -ba webui/src/model/store.ts | sed -n '1,35p'`; `nl -ba webui/src/types/file-system-access.d.ts`
- **Output:** `Cabinet` receives a `File`, reads it with `FileReader`, and calls `importYaml` with `file.name`; `WorkspaceData` stores only `fileHandles`; the local file-system declaration exposes `FileSystemFileHandle.name`, `getFile`, and writable operations but no parent path.
- **Status:** confirmed
- **Notes:** A pure resolver can accept an explicit manifest directory, but normal file-picker and drag/drop imports cannot currently provide one. End-to-end support therefore requires either a narrower API-only contract or a product-level directory/asset-selection workflow.

### E7 — [reproducer] asset helper behavior verified
- **Claim:** Selected image files resolve to manifest-relative object-source keys with normalized dot/backslash segments, while manifests and non-images are excluded.
- **Environment:** deckbox branch `codex/z47y-relative-image-paths`, 2026-07-14.
- **Command / Source:** `npm exec vitest run tests/imageAssets.test.ts`
- **Output:** `Test Files 1 passed`; `Tests 8 passed`.
- **Status:** confirmed

### E8 — [structural] transient source lifecycle is isolated from persisted decks
- **Claim:** The workspace stores per-deck image sources outside `Deck` persistence, passes them to rendering, and revokes them on deck deletion or workspace reset.
- **Environment:** deckbox branch `codex/z47y-relative-image-paths`, 2026-07-14.
- **Command / Source:** `nl -ba webui/src/model/store.ts`; `npm exec vitest run tests/store.test.ts`
- **Output:** `WorkspaceData.imageSources` is not included by `partialize`; lifecycle tests pass with `Test Files 1 passed` and `Tests 47 passed`.
- **Status:** confirmed

### E9 — [reproducer] directory import and rendering verified
- **Claim:** Folder import requires exactly one manifest, maps sibling images, and renders relative front/back sources through TestDraw; single-file import remains covered.
- **Environment:** deckbox branch `codex/z47y-relative-image-paths`, 2026-07-14.
- **Command / Source:** `npm exec vitest run` from `webui/`
- **Output:** `Test Files 13 passed`; `Tests 257 passed`.
- **Status:** confirmed

### E10 — [reproducer] production verification completed
- **Claim:** The web UI builds successfully through WASM compilation, TypeScript checking, and Vite production bundling; lint has only the repository's existing Fast Refresh warnings.
- **Environment:** deckbox branch `codex/z47y-relative-image-paths`, host-access build, 2026-07-14.
- **Command / Source:** `npm run build`; `npm run lint`
- **Output:** Vite ended with `✓ built`; lint reported the two existing `src/engine/useEngine.tsx` Fast Refresh warnings and no errors.
- **Status:** confirmed
