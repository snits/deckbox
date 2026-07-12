// ABOUTME: React wiring for the engine bridge: an EngineProvider that lazily
// ABOUTME: loads WASM (or accepts an injected engine for tests), plus the
// ABOUTME: useEngine hook that exposes it to the component tree.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { initEngine, type Engine } from './engine';

const EngineContext = createContext<Engine | null>(null);

export function useEngine(): Engine {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be called within an EngineProvider');
  return ctx;
}

/** Like `useEngine`, but returns null instead of throwing when there's no
 * `EngineProvider` ancestor — for components that are mounted unconditionally
 * (so can't gate the hook call on a deck being selected, the way `TestDraw`
 * does) but only need the engine for an occasional user action. */
export function useOptionalEngine(): Engine | null {
  return useContext(EngineContext);
}

type LoadState =
  | { status: 'ready'; engine: Engine }
  | { status: 'loading' }
  | { status: 'error'; message: string };

export function EngineProvider({ engine, children }: { engine?: Engine; children: ReactNode }) {
  const [state, setState] = useState<LoadState>(() =>
    engine ? { status: 'ready', engine } : { status: 'loading' },
  );

  useEffect(() => {
    if (engine) return;
    let cancelled = false;
    initEngine()
      .then((loaded) => {
        if (!cancelled) setState({ status: 'ready', engine: loaded });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [engine]);

  if (state.status === 'loading') return <div>Loading engine…</div>;
  if (state.status === 'error') return <div>Engine failed to load: {state.message}</div>;

  return <EngineContext.Provider value={state.engine}>{children}</EngineContext.Provider>;
}
