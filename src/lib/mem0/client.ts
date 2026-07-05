import MemoryClient from 'mem0ai';

import { getMem0ApiKey, isMem0Enabled } from '@/lib/mem0/config';

let client: MemoryClient | null = null;

export function getMem0Client(): MemoryClient | null {
  if (!isMem0Enabled()) {
    return null;
  }

  if (!client) {
    client = new MemoryClient({ apiKey: getMem0ApiKey() });
  }

  return client;
}
