import assert from 'node:assert/strict';

import { buildMemoriesBlock, buildRecentTurnsBlock } from '@/lib/mem0/prompt-block';
import type { RetrievedMemory } from '@/lib/mem0/types';
import { isMem0Enabled } from '@/lib/mem0/config';
import { getMem0MemoryUserId } from '@/lib/mem0/identity';
import { persistTurnToMem0 } from '@/lib/mem0/persist';
import { prepareMemoriesForPrompt, shouldUseMem0ForTranscript } from '@/lib/mem0/policy';
import { searchUserMemories } from '@/lib/mem0/search';

function testPromptBlocks() {
  const memories: RetrievedMemory[] = [
    { id: '1', memory: 'User makes tiramisu for family celebrations' },
  ];

  const memoriesBlock = buildMemoriesBlock(memories);
  assert.ok(memoriesBlock?.includes('tiramisu'));
  assert.ok(memoriesBlock?.includes('never mention'));

  const recentBlock = buildRecentTurnsBlock([
    {
      id: 'a',
      userTranscript: 'What is the capital of Portugal?',
      assistantSpoken: 'Lisbon.',
      createdAt: new Date().toISOString(),
    },
  ]);
  assert.ok(recentBlock?.includes('Lisbon'));
  assert.equal(buildMemoriesBlock([]), null);
  assert.equal(buildRecentTurnsBlock([]), null);
}

function testMem0Policy() {
  assert.equal(shouldUseMem0ForTranscript('Hi'), false);
  assert.equal(shouldUseMem0ForTranscript('What is your name?'), false);
  assert.equal(shouldUseMem0ForTranscript('I prefer vegan meals when traveling.'), true);

  const prepared = prepareMemoriesForPrompt(
    [
      { id: '1', memory: 'User prefers vegan meals when traveling.' },
      { id: '2', memory: 'User prefers vegan meals when traveling.' },
      {
        id: '3',
        memory: `User likes detailed planning notes ${'with context '.repeat(40)}`,
      },
    ],
    { maxMemories: 4, maxChars: 80 },
  );

  assert.equal(prepared.length, 2);
  assert.ok(prepared[1]!.memory.length <= 80);
  assert.ok(prepared[1]!.memory.endsWith('...'));
}

function testMemoryIdentity() {
  assert.equal(
    getMem0MemoryUserId({ userId: 'user-123', astraKey: 'ak_workspace' }),
    'user-123',
  );
  assert.throws(
    () => getMem0MemoryUserId({ userId: '', astraKey: 'ak_workspace' }),
    /Authenticated user id is required/,
  );
}

async function testLiveMem0RoundTrip() {
  if (!isMem0Enabled()) {
    console.log('[mem0-test] MEM0_API_KEY not set — skipping live API test');
    return;
  }

  const userId = `chrysty-test-${Date.now()}`;
  const transcript = "I'm making tiramisu for my mom's birthday this weekend.";
  const spoken = 'That sounds wonderful — tiramisu is a great celebration dessert.';

  await persistTurnToMem0(userId, transcript, spoken);

  // Mem0 extraction is async; retry search briefly.
  let hits: RetrievedMemory[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    hits = await searchUserMemories(userId, 'dessert ideas for a celebration');
    if (hits.some((entry) => /tiramisu/i.test(entry.memory))) {
      break;
    }
  }

  assert.ok(
    hits.some((entry) => /tiramisu/i.test(entry.memory)),
    `Expected tiramisu memory for test user ${userId}, got: ${JSON.stringify(hits)}`,
  );

  console.log(`[mem0-test] live round-trip OK for ${userId}`);
}

async function main() {
  testPromptBlocks();
  testMem0Policy();
  testMemoryIdentity();
  await testLiveMem0RoundTrip();
  console.log('[mem0-test] all checks passed');
}

main().catch((error) => {
  console.error('[mem0-test] failed', error);
  process.exit(1);
});
