import { randomInt } from 'node:crypto';

const MIN_ITEMS = 2;
const MAX_ITEMS = 20;

export interface RandomChoiceInput {
  items: string[];
  count?: number;
  allowDuplicates?: boolean;
}

export interface RandomChoiceResult {
  picks: string[];
  pool: string[];
}

export function randomChoice(input: RandomChoiceInput): RandomChoiceResult {
  const pool = input.items.map((item) => item.trim()).filter(Boolean);

  if (pool.length < MIN_ITEMS) {
    throw new Error(`Provide at least ${MIN_ITEMS} non-empty items.`);
  }

  if (pool.length > MAX_ITEMS) {
    throw new Error(`Provide at most ${MAX_ITEMS} items.`);
  }

  const allowDuplicates = input.allowDuplicates ?? false;
  const requestedCount = input.count ?? 1;
  const count = Math.max(1, Math.min(requestedCount, allowDuplicates ? pool.length * 2 : pool.length));

  if (!allowDuplicates && count > pool.length) {
    throw new Error('count cannot exceed the number of unique items when allowDuplicates is false.');
  }

  const picks: string[] = [];
  const available = [...pool];

  for (let index = 0; index < count; index += 1) {
    if (allowDuplicates) {
      picks.push(pool[randomInt(pool.length)]!);
      continue;
    }

    const chosenIndex = randomInt(available.length);
    picks.push(available.splice(chosenIndex, 1)[0]!);
  }

  return { picks, pool };
}
