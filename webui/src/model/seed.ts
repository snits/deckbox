// ABOUTME: A fully-formed example deck used as a shared fixture across the test
// ABOUTME: suite — exact composition pinned by the Global Constraints.

import type { Deck } from './types';

export function seedDeck(): Deck {
  return {
    uid: 's1',
    name: 'Fate Oracle',
    description: 'Draw to reveal what fate has in store',
    containers: ['discard'],
    cards: [
      {
        cid: 'c1',
        id: 'goblin-ambush',
        title: 'Goblin Ambush',
        text: 'A band of goblins leaps from the bushes!',
        count: '3',
        meta: [],
        expanded: false,
      },
      {
        cid: 'c2',
        id: 'dragon-sighting',
        title: 'Dragon Sighting',
        text: 'A shadow passes overhead…',
        count: '1',
        meta: [],
        expanded: false,
      },
      {
        cid: 'c3',
        id: 'ancient-ruins',
        title: 'Ancient Ruins',
        text: 'You stumble upon crumbling stone walls…',
        count: '1',
        meta: [
          { rid: 'm1', key: 'category', value: 'exploration' },
          { rid: 'm2', key: 'image', value: 'ancient-ruins.png' },
        ],
        expanded: true,
      },
      {
        cid: 'c4',
        id: 'sudden-storm',
        title: 'Sudden Storm',
        text: 'Rain hammers down; the road turns to mud.',
        count: '2',
        meta: [],
        expanded: false,
      },
    ],
  };
}
