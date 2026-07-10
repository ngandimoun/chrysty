export const CAPABILITY_KINDS = ['timer', 'reminder', 'checkpoint'] as const;
export const CAPABILITY_ACTIONS = ['schedule', 'list', 'cancel', 'snooze', 'complete'] as const;
export const CAPABILITY_ACTIVE_STATUSES = ['scheduled', 'snoozed', 'due'] as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];
export type CapabilityAction = (typeof CAPABILITY_ACTIONS)[number];
export type CapabilityStatus =
  | (typeof CAPABILITY_ACTIVE_STATUSES)[number]
  | 'completed'
  | 'canceled';

export interface ManageCapabilityInput {
  action: CapabilityAction;
  kind?: CapabilityKind;
  capability_id?: string;
  title?: string;
  fire_at?: string;
  timezone?: string;
  expected_revision?: number;
  snooze_minutes?: number;
  task_id?: string;
  session_id?: string;
  idempotency_key?: string;
  confirmed_user_intent?: boolean;
}

export interface ScheduledCapability {
  id: string;
  workspaceId: string;
  userId: string;
  astraKey: string;
  kind: CapabilityKind;
  title: string;
  fireAt: string;
  timezone: string;
  status: CapabilityStatus;
  revision: number;
  taskId: string | null;
  sessionId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityToolFailure {
  ok: false;
  code: string;
  message: string;
  retryable?: boolean;
  clarification_required?: boolean;
  current_revision?: number;
}

export interface CapabilityToolSuccess {
  ok: true;
  capability?: ScheduledCapability;
  capabilities?: ScheduledCapability[];
  replayed?: boolean;
}

export type CapabilityToolResult = CapabilityToolSuccess | CapabilityToolFailure;
