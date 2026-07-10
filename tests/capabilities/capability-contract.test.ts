import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateManageCapability } from '../../src/lib/capabilities/contract';
import { isCronAuthorized } from '../../src/lib/capabilities/cron-auth';
import {
  canApplyCapabilityAction,
  capabilityDeliveryKey,
  shouldDeliverCapability,
} from '../../src/lib/capabilities/lifecycle';

const scheduled = validateManageCapability({
  action: 'schedule',
  kind: 'reminder',
  title: 'Call Alex',
  fire_at: '2026-11-01T01:30:00-04:00',
  timezone: 'America/New_York',
  idempotency_key: 'turn-1-call-alex',
  confirmed_user_intent: true,
});
assert.equal(scheduled.ok, true);
if (scheduled.ok) {
  assert.equal(new Date(scheduled.value.fire_at!).toISOString(), '2026-11-01T05:30:00.000Z');
}

const ambiguous = validateManageCapability({
  action: 'schedule',
  kind: 'timer',
  title: 'Tea',
  fire_at: '2026-11-01T01:30:00',
  timezone: 'America/New_York',
  idempotency_key: 'tea',
  confirmed_user_intent: true,
});
assert.equal(ambiguous.ok, false);
if (!ambiguous.ok) assert.equal(ambiguous.error.code, 'fire_at_ambiguous');

const destructiveWithoutIntent = validateManageCapability({
  action: 'cancel',
  capability_id: '123e4567-e89b-42d3-a456-426614174000',
  expected_revision: 1,
});
assert.equal(destructiveWithoutIntent.ok, false);

assert.equal(canApplyCapabilityAction('scheduled', 'snooze'), true);
assert.equal(canApplyCapabilityAction('due', 'complete'), true);
assert.equal(canApplyCapabilityAction('completed', 'snooze'), false);
assert.equal(canApplyCapabilityAction('canceled', 'complete'), false);

const delivered = new Set([capabilityDeliveryKey('cap-1', 2)]);
assert.equal(shouldDeliverCapability(delivered, 'cap-1', 2), false);
assert.equal(shouldDeliverCapability(delivered, 'cap-1', 3), true);
assert.equal(shouldDeliverCapability(new Set(), 'cap-1', 2), true);

const secret = 'cron-secret';
assert.equal(
  isCronAuthorized(new Request('https://example.test', { headers: { authorization: `Bearer ${secret}` } }), secret),
  true,
);
assert.equal(
  isCronAuthorized(new Request('https://example.test', { headers: { authorization: `bearer ${secret}` } }), secret),
  false,
);
assert.equal(isCronAuthorized(new Request('https://example.test'), secret), false);
assert.equal(isCronAuthorized(new Request('https://example.test'), ''), false);

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260710230000_scheduled_capabilities.sql'),
  'utf8',
);
assert.match(migration, /user_id uuid not null references auth\.users/);
assert.match(migration, /using \(user_id = auth\.uid\(\)\)/);
assert.match(migration, /unique \(capability_id, revision, channel\)/);
assert.match(migration, /unique \(user_id, idempotency_key\)/);

console.log('capability contract tests passed');
