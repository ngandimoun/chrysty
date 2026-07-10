export interface AstraWorkspaceRow {
  id: string;
  user_id: string | null;
  platform_workspace_id: string | null;
  name: string;
  visitor_token: string;
  astra_key: string;
  settings: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type AstraWorkspaceInsert = Omit<
  AstraWorkspaceRow,
  'id' | 'created_at' | 'updated_at' | 'visitor_token' | 'settings'
> & {
  id?: string;
  visitor_token?: string;
  settings?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export interface AstraCompanionProfileRow {
  workspace_id: string;
  astra_key: string;
  user_id: string | null;
  preferred_name: string | null;
  occupation: string | null;
  preferred_language_code: string | null;
  preferred_language_label: string | null;
  food_preferences: string | null;
  health_notes: string | null;
  interests: string | null;
  topics_to_avoid: string | null;
  interaction_preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AstraReferenceDocumentRow {
  id: string;
  workspace_id: string;
  astra_key: string;
  user_id: string | null;
  name: string;
  kind: 'image' | 'pdf';
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

export interface AstraGeneratedDocumentRow {
  id: string;
  workspace_id: string;
  astra_key: string;
  user_id: string | null;
  kind: string;
  title: string;
  mime_type: string | null;
  size_bytes: number;
  storage_path: string | null;
  json_payload: string | null;
  job_id: string | null;
  created_at: string;
  read_at: string | null;
  revision: number;
  updated_at: string;
  last_mutation: Record<string, unknown> | null;
  source_key: string | null;
  source_metadata: Record<string, unknown>;
  audit_metadata: Record<string, unknown>;
  artifact_language: string;
}

export interface AstraConversationTurnRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  astra_key: string;
  user_transcript: string;
  assistant_spoken: string | null;
  has_images: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AstraScheduledCapabilityRow {
  id: string;
  workspace_id: string;
  user_id: string;
  astra_key: string;
  kind: 'timer' | 'reminder' | 'checkpoint';
  title: string;
  fire_at: string;
  timezone: string;
  status: 'scheduled' | 'snoozed' | 'due' | 'completed' | 'canceled';
  revision: number;
  idempotency_key: string;
  task_id: string | null;
  session_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  delivered_at: string | null;
  audit_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
