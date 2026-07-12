// ABOUTME: Tests for the engine bridge: wrapEngine's JSON parsing over a fake
// ABOUTME: raw engine, plus EngineProvider/useEngine wiring.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { RawEngine, SessionState } from '../src/engine/engine';
import { wrapEngine } from '../src/engine/engine';
import { EngineProvider, useEngine } from '../src/engine/useEngine';

afterEach(cleanup);

function makeRawEngine(): RawEngine {
  return {
    parse_deck: () => '',
    validate_deck: () => '',
    new_session: () => '',
    draw: () => '',
    peek: () => '',
    shuffle: () => '',
  };
}

const SESSION: SessionState = {
  name: 'webui',
  definition_path: '-',
  containers: { draw_pile: ['alpha:1', 'beta:1'], discard: [] },
  definition_cards: ['alpha', 'beta'],
};

describe('wrapEngine', () => {
  describe('parseDeck', () => {
    it('parses an ok envelope into a ParsedDeck, mapping saw_comments/dropped_keys to camelCase', () => {
      const raw = {
        ...makeRawEngine(),
        parse_deck: (_yaml: string) =>
          JSON.stringify({
            ok: true,
            deck: {
              name: 'Oracle',
              description: null,
              containers: null,
              cards: [{ id: 'a', title: null, text: 'A', count: null, metadata: null }],
            },
            saw_comments: true,
            dropped_keys: ['extra_field'],
          }),
      };
      const engine = wrapEngine(raw);
      const result = engine.parseDeck('name: Oracle');
      expect(result).toEqual({
        ok: true,
        deck: {
          name: 'Oracle',
          description: null,
          containers: null,
          cards: [{ id: 'a', title: null, text: 'A', count: null, metadata: null }],
        },
        sawComments: true,
        droppedKeys: ['extra_field'],
      });
    });

    it('parses a not-ok envelope into a parse error, no throw', () => {
      const raw = {
        ...makeRawEngine(),
        parse_deck: () => JSON.stringify({ ok: false, error: 'malformed yaml' }),
      };
      const engine = wrapEngine(raw);
      expect(engine.parseDeck('not: valid: [')).toEqual({ ok: false, error: 'malformed yaml' });
    });
  });

  describe('validateDeck', () => {
    it('parses a valid envelope', () => {
      const raw = { ...makeRawEngine(), validate_deck: () => JSON.stringify({ valid: true }) };
      const engine = wrapEngine(raw);
      expect(engine.validateDeck('name: Oracle')).toEqual({ valid: true });
    });

    it('parses an invalid envelope with its error message', () => {
      const raw = {
        ...makeRawEngine(),
        validate_deck: () => JSON.stringify({ valid: false, error: 'duplicate card ID: dupe' }),
      };
      const engine = wrapEngine(raw);
      expect(engine.validateDeck('name: Bad')).toEqual({
        valid: false,
        error: 'duplicate card ID: dupe',
      });
    });
  });

  describe('newSession', () => {
    it('parses an ok envelope into a SessionState', () => {
      const raw = { ...makeRawEngine(), new_session: () => JSON.stringify(SESSION) };
      const engine = wrapEngine(raw);
      expect(engine.newSession('name: Oracle')).toEqual(SESSION);
    });

    it('throws on an {"error"} envelope', () => {
      const raw = {
        ...makeRawEngine(),
        new_session: () => JSON.stringify({ error: 'missing field `cards`' }),
      };
      const engine = wrapEngine(raw);
      expect(() => engine.newSession('cards: []')).toThrow('missing field `cards`');
    });
  });

  describe('draw', () => {
    it('parses an ok envelope into session and drawn, passing the session as JSON', () => {
      let seenSessionJson = '';
      const raw = {
        ...makeRawEngine(),
        draw: (sessionJson: string, count: number) => {
          seenSessionJson = sessionJson;
          expect(count).toBe(2);
          return JSON.stringify({ session: SESSION, drawn: ['beta:1', 'alpha:1'] });
        },
      };
      const engine = wrapEngine(raw);
      const result = engine.draw(SESSION, 2);
      expect(result).toEqual({ session: SESSION, drawn: ['beta:1', 'alpha:1'] });
      expect(JSON.parse(seenSessionJson)).toEqual(SESSION);
    });

    it('throws on an {"error"} envelope', () => {
      const raw = { ...makeRawEngine(), draw: () => JSON.stringify({ error: 'not enough cards' }) };
      const engine = wrapEngine(raw);
      expect(() => engine.draw(SESSION, 99)).toThrow('not enough cards');
    });
  });

  describe('peek', () => {
    it('parses an ok envelope into the cards array', () => {
      const raw = { ...makeRawEngine(), peek: () => JSON.stringify({ cards: ['alpha:1'] }) };
      const engine = wrapEngine(raw);
      expect(engine.peek(SESSION, 1)).toEqual(['alpha:1']);
    });

    it('throws on an {"error"} envelope', () => {
      const raw = { ...makeRawEngine(), peek: () => JSON.stringify({ error: 'not enough cards' }) };
      const engine = wrapEngine(raw);
      expect(() => engine.peek(SESSION, 99)).toThrow('not enough cards');
    });
  });

  describe('shuffle', () => {
    it('parses an ok envelope into a SessionState', () => {
      const raw = { ...makeRawEngine(), shuffle: () => JSON.stringify(SESSION) };
      const engine = wrapEngine(raw);
      expect(engine.shuffle(SESSION, 42)).toEqual(SESSION);
    });

    it('throws on an {"error"} envelope', () => {
      const raw = { ...makeRawEngine(), shuffle: () => JSON.stringify({ error: 'bad session' }) };
      const engine = wrapEngine(raw);
      expect(() => engine.shuffle(SESSION, 42)).toThrow('bad session');
    });
  });
});

function makeFakeEngine() {
  return {
    parseDeck: () => ({ ok: false as const, error: 'not used' }),
    validateDeck: () => ({ valid: true }),
    newSession: () => SESSION,
    draw: () => ({ session: SESSION, drawn: [] }),
    peek: () => [],
    shuffle: () => SESSION,
  };
}

describe('EngineProvider / useEngine', () => {
  it('provides the injected engine immediately, without a loading fallback', () => {
    render(
      <EngineProvider engine={makeFakeEngine()}>
        <div>ready</div>
      </EngineProvider>,
    );
    expect(screen.getByText('ready')).toBeTruthy();
    expect(screen.queryByText(/Loading engine/i)).toBeNull();
  });

  it('useEngine returns the injected engine inside a provider', () => {
    const fake = makeFakeEngine();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engine={fake}>{children}</EngineProvider>
    );
    const { result } = renderHook(() => useEngine(), { wrapper });
    expect(result.current).toBe(fake);
  });

  it('useEngine throws outside a provider', () => {
    const { result } = renderHook(() => {
      try {
        useEngine();
        return null;
      } catch (err) {
        return err;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
  });
});
