import type { CapabilityAction, CapabilityStatus } from './types';

export function canApplyCapabilityAction(
  status: CapabilityStatus,
  action: CapabilityAction,
): boolean {
  if (action === 'list' || action === 'schedule') return true;
  if (!['scheduled', 'snoozed', 'due'].includes(status)) return false;
  return action === 'cancel' || action === 'snooze' || action === 'complete';
}

export function capabilityDeliveryKey(id: string, revision: number): string {
  return `${id}:${revision}`;
}

export function shouldDeliverCapability(
  delivered: ReadonlySet<string>,
  id: string,
  revision: number,
): boolean {
  return !delivered.has(capabilityDeliveryKey(id, revision));
}
