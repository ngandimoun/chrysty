import type { PerceptionCapabilityId, PerceptionProfileId } from './types';

export interface CapabilityDefinition {
  id: PerceptionCapabilityId;
  label: string;
  activeLabel: string;
  description: string;
}

export const CAPABILITIES: Record<PerceptionCapabilityId, CapabilityDefinition> = {
  object_finder: {
    id: 'object_finder',
    label: 'Object Finder',
    activeLabel: 'Finding objects',
    description: 'Detects everyday objects and approximate locations.',
  },
  text_reader: {
    id: 'text_reader',
    label: 'Text Reader',
    activeLabel: 'Reading text',
    description: 'Reads visible text on demand or at a slow cadence.',
  },
  code_scanner: {
    id: 'code_scanner',
    label: 'Code Scanner',
    activeLabel: 'Scanning code',
    description: 'Scans QR codes and barcodes.',
  },
  hand_tracking: {
    id: 'hand_tracking',
    label: 'Hand Tracking',
    activeLabel: 'Tracking hands',
    description: 'Detects hands and hand landmarks.',
  },
  pose_tracking: {
    id: 'pose_tracking',
    label: 'Pose Tracking',
    activeLabel: 'Checking posture',
    description: 'Detects body pose for coaching and workout flows.',
  },
  face_awareness: {
    id: 'face_awareness',
    label: 'Face Awareness',
    activeLabel: 'Checking presence',
    description: 'Detects face presence/orientation without identity recognition.',
  },
  gesture_detection: {
    id: 'gesture_detection',
    label: 'Gesture Detection',
    activeLabel: 'Watching gestures',
    description: 'Detects simple user gestures.',
  },
  scene_change_monitor: {
    id: 'scene_change_monitor',
    label: 'Scene Change Monitor',
    activeLabel: 'Looking at the scene',
    description: 'Tracks meaningful changes in the current scene.',
  },
  memory_assist: {
    id: 'memory_assist',
    label: 'Memory Assist',
    activeLabel: 'Remembering what changed',
    description: 'Tracks last-seen objects and user-approved scene changes.',
  },
};

export const PROFILE_CAPABILITIES: Record<PerceptionProfileId, PerceptionCapabilityId[]> = {
  general: ['scene_change_monitor', 'code_scanner'],
  reading: ['text_reader', 'object_finder', 'scene_change_monitor'],
  shopping: ['code_scanner', 'text_reader', 'object_finder', 'scene_change_monitor'],
  cooking: ['object_finder', 'hand_tracking', 'text_reader', 'scene_change_monitor'],
  workout: ['pose_tracking', 'hand_tracking', 'gesture_detection'],
  navigation: ['object_finder', 'text_reader', 'scene_change_monitor'],
  accessibility: ['object_finder', 'text_reader', 'scene_change_monitor', 'memory_assist'],
  diy: ['object_finder', 'hand_tracking', 'text_reader', 'scene_change_monitor'],
  memory_assist: ['object_finder', 'scene_change_monitor', 'memory_assist'],
};

export function getCapabilityLabel(id: PerceptionCapabilityId): string {
  return CAPABILITIES[id]?.label ?? id;
}

export function getCapabilityActiveLabel(id: PerceptionCapabilityId): string {
  return CAPABILITIES[id]?.activeLabel ?? 'Looking at the scene';
}

export function capabilitiesForProfile(profile: PerceptionProfileId): Set<PerceptionCapabilityId> {
  return new Set(PROFILE_CAPABILITIES[profile] ?? PROFILE_CAPABILITIES.general);
}

