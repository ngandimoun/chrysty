import {
  CAPABILITY_ACTIONS,
  CAPABILITY_KINDS,
  type CapabilityToolFailure,
  type ManageCapabilityInput,
} from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE = 160;
const MAX_SNOOZE_MINUTES = 60 * 24 * 30;

export const MANAGE_CAPABILITY_PARAMETERS: {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required: string[];
} = {
  type: 'object',
  properties: {
    action: { type: 'string', description: 'schedule | list | cancel | snooze | complete' },
    kind: { type: 'string', description: 'timer | reminder | checkpoint' },
    capability_id: { type: 'string', description: 'Capability UUID for cancel, snooze, or complete' },
    title: { type: 'string', description: 'Short user-facing label' },
    fire_at: { type: 'string', description: 'Unambiguous ISO 8601 instant including UTC offset' },
    timezone: { type: 'string', description: 'IANA timezone used to interpret and display the schedule' },
    expected_revision: { type: 'number', description: 'Current revision for conflict-safe mutations' },
    snooze_minutes: { type: 'number', description: 'Whole minutes to snooze, from 1 to 43200' },
    task_id: { type: 'string', description: 'Optional related task identifier' },
    session_id: { type: 'string', description: 'Optional related Live session identifier' },
    idempotency_key: { type: 'string', description: 'Stable unique key for retry-safe scheduling' },
    confirmed_user_intent: {
      type: 'boolean',
      description: 'True only when the user clearly requested this mutation',
    },
  },
  required: ['action'],
};

function failure(code: string, message: string, clarification = false): CapabilityToolFailure {
  return { ok: false, code, message, clarification_required: clarification };
}

export function validateManageCapability(
  value: Record<string, unknown>,
): { ok: true; value: ManageCapabilityInput } | { ok: false; error: CapabilityToolFailure } {
  const action = typeof value.action === 'string' ? value.action.trim() : '';
  if (!CAPABILITY_ACTIONS.includes(action as ManageCapabilityInput['action'])) {
    return { ok: false, error: failure('invalid_action', 'A valid capability action is required.', true) };
  }

  const input: ManageCapabilityInput = { action: action as ManageCapabilityInput['action'] };
  const textFields = ['kind', 'capability_id', 'title', 'fire_at', 'timezone', 'task_id', 'session_id', 'idempotency_key'] as const;
  for (const key of textFields) {
    const raw = value[key];
    if (typeof raw === 'string' && raw.trim()) Object.assign(input, { [key]: raw.trim() });
  }
  if (typeof value.expected_revision === 'number' && Number.isInteger(value.expected_revision)) {
    input.expected_revision = value.expected_revision;
  }
  if (typeof value.snooze_minutes === 'number' && Number.isInteger(value.snooze_minutes)) {
    input.snooze_minutes = value.snooze_minutes;
  }
  input.confirmed_user_intent = value.confirmed_user_intent === true;

  if (action === 'list') return { ok: true, value: input };
  if (!input.confirmed_user_intent) {
    return {
      ok: false,
      error: failure(
        'confirmation_required',
        'A clear user request is required before changing scheduled capabilities.',
        true,
      ),
    };
  }

  if (action === 'schedule') {
    if (!input.kind || !CAPABILITY_KINDS.includes(input.kind)) {
      return { ok: false, error: failure('kind_required', 'Choose timer, reminder, or checkpoint.', true) };
    }
    if (!input.title || input.title.length > MAX_TITLE) {
      return { ok: false, error: failure('title_required', 'A short title is required.', true) };
    }
    if (!input.fire_at || Number.isNaN(Date.parse(input.fire_at)) || !/[zZ]|[+-]\d\d:\d\d$/.test(input.fire_at)) {
      return {
        ok: false,
        error: failure('fire_at_ambiguous', 'fire_at must be an ISO 8601 instant with an explicit offset.', true),
      };
    }
    if (!input.timezone) {
      return { ok: false, error: failure('timezone_required', 'An IANA timezone is required.', true) };
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format();
    } catch {
      return { ok: false, error: failure('invalid_timezone', 'The timezone is not a valid IANA zone.', true) };
    }
    if (!input.idempotency_key || input.idempotency_key.length > 128) {
      return {
        ok: false,
        error: failure('idempotency_key_required', 'A retry-safe idempotency key is required.'),
      };
    }
    return { ok: true, value: input };
  }

  if (!input.capability_id || !UUID.test(input.capability_id)) {
    return { ok: false, error: failure('capability_id_required', 'A valid capability id is required.', true) };
  }
  if (!input.expected_revision || input.expected_revision < 1) {
    return { ok: false, error: failure('revision_required', 'The current revision is required.') };
  }
  if (
    action === 'snooze' &&
    (!input.snooze_minutes ||
      input.snooze_minutes < 1 ||
      input.snooze_minutes > MAX_SNOOZE_MINUTES)
  ) {
    return { ok: false, error: failure('invalid_snooze', 'Snooze must be 1 to 43200 whole minutes.', true) };
  }
  return { ok: true, value: input };
}
