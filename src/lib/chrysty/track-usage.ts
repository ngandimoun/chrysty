import { usage } from '@chrysty/platform';

import { WORKER_SLUG } from '@/lib/chrysty/constants';

type AgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export async function trackAgentUsage(agentUsage: AgentUsage) {
  const tokensInput = agentUsage.inputTokens ?? 0;
  const tokensOutput = agentUsage.outputTokens ?? 0;
  const estimatedCost = (tokensInput + tokensOutput) * 0.000003;

  await usage.track({
    workerSlug: WORKER_SLUG,
    actionType: 'ai_completion',
    tokensInput,
    tokensOutput,
    estimatedCost,
  });
}
