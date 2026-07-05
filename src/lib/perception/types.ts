export type PerceptionCapabilityId =
  | 'object_finder'
  | 'text_reader'
  | 'code_scanner'
  | 'hand_tracking'
  | 'pose_tracking'
  | 'face_awareness'
  | 'gesture_detection'
  | 'scene_change_monitor'
  | 'memory_assist';

export type DetectorStatus = 'idle' | 'loading' | 'ready' | 'disabled' | 'failed' | 'degraded';

export type PerceptionProfileId =
  | 'general'
  | 'reading'
  | 'shopping'
  | 'cooking'
  | 'workout'
  | 'navigation'
  | 'accessibility'
  | 'diy'
  | 'memory_assist';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PerceptionObservation {
  id: string;
  kind:
    | 'object'
    | 'text'
    | 'code'
    | 'person'
    | 'hand'
    | 'pose'
    | 'face'
    | 'gesture'
    | 'scene';
  capability: PerceptionCapabilityId;
  label: string;
  confidence: number;
  source: string;
  observedAt: string;
  frameId?: string;
  bbox?: BoundingBox;
  text?: string;
  value?: string;
  format?: string;
  landmarks?: LandmarkPoint[];
  metadata?: Record<string, string | number | boolean>;
}

export interface PerceptionEvent {
  id: string;
  type:
    | 'object_entered'
    | 'object_left'
    | 'object_moved'
    | 'text_changed'
    | 'gesture_started'
    | 'gesture_ended'
    | 'code_scanned'
    | 'scene_became_unclear'
    | 'nothing_important_changed';
  label: string;
  confidence: number;
  occurredAt: string;
  capability?: PerceptionCapabilityId;
  observationIds?: string[];
  summary?: string;
}

export interface DetectorHealth {
  detectorId: string;
  capability: PerceptionCapabilityId;
  status: DetectorStatus;
  label: string;
  message?: string;
  updatedAt: string;
  averageLatencyMs?: number;
}

export interface SceneState {
  objects: PerceptionObservation[];
  text: PerceptionObservation[];
  codes: PerceptionObservation[];
  people: PerceptionObservation[];
  hands: PerceptionObservation[];
  gestures: PerceptionObservation[];
  summary?: string;
  lastUpdated: string;
}

export interface PerceptionMemorySummary {
  lastSeen: Array<{
    label: string;
    kind: PerceptionObservation['kind'];
    lastSeenAt: string;
    summary: string;
    confidence: number;
  }>;
  recentChanges: PerceptionEvent[];
}

export interface PerceptionSnapshot {
  version: 1;
  profile: PerceptionProfileId;
  capturedAt: string;
  scene: SceneState;
  events: PerceptionEvent[];
  memory?: PerceptionMemorySummary;
  detectorHealth: DetectorHealth[];
}

export interface VideoFrameInput {
  video: HTMLVideoElement;
  frameId: string;
  capturedAt: string;
  profile: PerceptionProfileId;
}

export interface DetectionResult {
  observations: PerceptionObservation[];
  events?: PerceptionEvent[];
}

export interface DetectorContext {
  profile: PerceptionProfileId;
  enabledCapabilities: Set<PerceptionCapabilityId>;
  budget: ResourceBudget;
}

export interface PerceptionDetector {
  id: string;
  label: string;
  capabilities: PerceptionCapabilityId[];
  status: DetectorStatus;
  priority: number;
  start: () => Promise<void>;
  stop: () => void;
  detect: (frame: VideoFrameInput, context: DetectorContext) => Promise<DetectionResult>;
  getHealth: () => DetectorHealth[];
}

export interface ResourceBudget {
  tier: 'low' | 'medium' | 'high';
  maxDetectorsPerTick: number;
  minIntervalMs: number;
  reason: string;
}

export interface ScheduledDetector {
  detector: PerceptionDetector;
  intervalMs: number;
  priority: number;
}

