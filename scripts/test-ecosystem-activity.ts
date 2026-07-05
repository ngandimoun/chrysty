import assert from 'node:assert/strict';

import {
  redactText,
  summarizeWorkerAccumulators,
} from '@/lib/astra/ecosystem-activity';
import { resolveDisplaySlug } from '@/lib/astra/chrysty-workers';
import {
  buildChrystyEcosystemBlock,
  buildUserEcosystemActivityBlock,
  findEcosystemRecommendation,
} from '@/lib/gemini/chrysty-ecosystem';

function testRedaction() {
  assert.equal(
    redactText('Paid $1,234.50 to vendor@example.com'),
    'Paid [amount] to [email]',
  );
  assert.equal(redactText('Account 1234 5678 9012 3456'), 'Account [account]');
}

function testSlugMapping() {
  assert.equal(resolveDisplaySlug('tutor'), 'learning');
  assert.equal(resolveDisplaySlug('ledger'), 'ledger');
  assert.equal(resolveDisplaySlug('astra'), null);
}

function testSummarizationBudget() {
  const accumulators = new Map([
    [
      'ledger',
      {
        platformSlug: 'ledger',
        workspaceNames: ['Main books'],
        conversationTitles: ['Invoice follow-up', 'Q1 expenses'],
        usageActionCounts: new Map([['chat_message', 4]]),
        learningSessions: [],
        lastActivityAt: new Date().toISOString(),
      },
    ],
    [
      'tutor',
      {
        platformSlug: 'tutor',
        workspaceNames: [],
        conversationTitles: [],
        usageActionCounts: new Map(),
        learningSessions: [
          {
            title: 'Linear algebra',
            type: 'practice',
            current_topic: 'Eigenvalues',
            progress: 55,
            updated_at: new Date().toISOString(),
            worker_slug: 'tutor',
          },
        ],
        lastActivityAt: new Date().toISOString(),
      },
    ],
    [
      'business-advisor',
      {
        platformSlug: 'business-advisor',
        workspaceNames: ['Growth plan'],
        conversationTitles: [],
        usageActionCounts: new Map([['ai_completion', 2]]),
        learningSessions: [],
        lastActivityAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
    [
      'stylist',
      {
        platformSlug: 'stylist',
        workspaceNames: ['Wardrobe'],
        conversationTitles: [],
        usageActionCounts: new Map(),
        learningSessions: [],
        lastActivityAt: new Date(Date.now() - 172_800_000).toISOString(),
      },
    ],
  ]);

  const summary = summarizeWorkerAccumulators(accumulators);
  assert.ok(summary);
  assert.ok(summary.workers.length <= 3);

  for (const worker of summary.workers) {
    assert.ok(worker.bullets.length <= 3);
    assert.ok(worker.workerName.length > 0);
  }

  const learningWorker = summary.workers.find((worker) => worker.workerSlug === 'learning');
  assert.ok(learningWorker);
  assert.ok(learningWorker.bullets.some((bullet) => bullet.includes('Linear algebra')));

  const promptBlock = buildUserEcosystemActivityBlock(summary);
  assert.ok(promptBlock);
  assert.ok(promptBlock.includes('continuity hints'));
  assert.ok(promptBlock.length <= 1200);
}

function testAnonymousSummary() {
  const promptBlock = buildUserEcosystemActivityBlock(null);
  assert.equal(promptBlock, null);
}

function testFocusedFashionRecommendation() {
  const recommendation = findEcosystemRecommendation(
    'I need fashion help. What should I wear to dinner tonight?',
  );

  assert.ok(recommendation);
  assert.equal(recommendation.workerName, 'Chrysty AI Stylist');
  assert.ok(recommendation.matchedSignals.includes('fashion'));

  const promptBlock = buildChrystyEcosystemBlock(
    undefined,
    'Help me plan outfits from my wardrobe for a wedding.',
  );
  assert.ok(promptBlock.includes('Focused Chrysty ecosystem hint'));
  assert.ok(promptBlock.includes('Chrysty AI Stylist'));
}

function testAvoidWeakAmbiguousRecommendation() {
  const recommendation = findEcosystemRecommendation('Make this writing style clearer.');
  assert.equal(recommendation, null);
}

function testRecentActivityBoost() {
  const recommendation = findEcosystemRecommendation('Can you help with style ideas?', {
    workers: [
      {
        workerSlug: 'stylist',
        workerName: 'Chrysty AI Stylist',
        bullets: ['Active workspace: "Wardrobe"'],
        lastActivityAt: new Date().toISOString(),
      },
    ],
  });

  assert.ok(recommendation);
  assert.equal(recommendation.workerName, 'Chrysty AI Stylist');
  assert.equal(recommendation.hasRecentActivity, true);
}

testRedaction();
testSlugMapping();
testSummarizationBudget();
testAnonymousSummary();
testFocusedFashionRecommendation();
testAvoidWeakAmbiguousRecommendation();
testRecentActivityBoost();

console.log('ecosystem activity tests passed');
