import assert from 'node:assert/strict';

import {
  countStockImageTokenOverlap,
  filterRelevantVisualImageGroupRequests,
  parseVisualImageGroupRequests,
} from '@/lib/visuals/stock-images';

const groups = parseVisualImageGroupRequests([
  {
    id: 'onion-steps',
    title: 'Onion steps',
    intent: 'step',
    layout: 'sequence',
    queries: ['chopped onion dice size', 'abstract background', 'happy person'],
  },
  {
    id: 'assistant-hero',
    title: 'Assistant mood',
    intent: 'hero',
    layout: 'single',
    queries: ['friendly ai assistant'],
  },
  {
    id: 'bike-part',
    title: 'Brake cable',
    intent: 'part',
    layout: 'single',
    queries: ['bicycle brake cable close up', 'technology background'],
  },
]);

const relevant = filterRelevantVisualImageGroupRequests(groups, {
  transcript: 'How do I dice an onion and check a bicycle brake cable?',
  explanationText:
    'Use a chopped onion dice size as the visual target. For the bike, inspect the bicycle brake cable where it enters the caliper.',
});

assert.equal(relevant.length, 2);
assert.deepEqual(
  relevant.map((group) => group.id),
  ['onion-steps', 'bike-part'],
);
assert.deepEqual(relevant[0]?.queries, ['chopped onion dice size']);
assert.deepEqual(relevant[1]?.queries, ['bicycle brake cable close up']);

const irrelevant = filterRelevantVisualImageGroupRequests(groups, {
  transcript: 'Hi, who are you?',
  explanationText: '',
});

assert.equal(irrelevant.length, 0);
assert.equal(countStockImageTokenOverlap('presta valve close up', 'Bike tire with presta valves'), 2);

console.log('stock image relevance smoke tests passed');
