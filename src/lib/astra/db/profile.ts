import type { CompanionProfile } from '@/lib/client/companion-profile';
import { hasCompanionProfile, normalizeCompanionProfile } from '@/lib/client/companion-profile';
import { createUntypedAdminClient } from '@/lib/supabase/admin';
import type { AstraCompanionProfileRow } from '@/lib/supabase/astra-schema.types';

function rowToProfile(row: AstraCompanionProfileRow | null): CompanionProfile {
  if (!row) return {};

  return normalizeCompanionProfile({
    preferredName: row.preferred_name ?? undefined,
    occupation: row.occupation ?? undefined,
    foodPreferences: row.food_preferences ?? undefined,
    healthNotes: row.health_notes ?? undefined,
    interests: row.interests ?? undefined,
    topicsToAvoid: row.topics_to_avoid ?? undefined,
    interactionPreferences: row.interaction_preferences ?? undefined,
  });
}

function profileToRow(
  workspaceId: string,
  astraKey: string,
  profile: CompanionProfile,
  userId?: string,
) {
  const normalized = normalizeCompanionProfile(profile);
  return {
    workspace_id: workspaceId,
    astra_key: astraKey,
    user_id: userId ?? null,
    preferred_name: normalized.preferredName ?? null,
    occupation: normalized.occupation ?? null,
    food_preferences: normalized.foodPreferences ?? null,
    health_notes: normalized.healthNotes ?? null,
    interests: normalized.interests ?? null,
    topics_to_avoid: normalized.topicsToAvoid ?? null,
    interaction_preferences: normalized.interactionPreferences ?? null,
  };
}

export async function getCompanionProfile(
  workspaceId: string,
): Promise<CompanionProfile> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_companion_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return rowToProfile(data as AstraCompanionProfileRow | null);
}

export async function upsertCompanionProfile(
  workspaceId: string,
  astraKey: string,
  profile: CompanionProfile,
  userId?: string,
): Promise<CompanionProfile> {
  const normalized = normalizeCompanionProfile(profile);

  if (!hasCompanionProfile(normalized)) {
    await createUntypedAdminClient()
      .from('astra_companion_profiles')
      .delete()
      .eq('workspace_id', workspaceId);
    return {};
  }

  const row = profileToRow(workspaceId, astraKey, normalized, userId);
  const { error } = await createUntypedAdminClient()
    .from('astra_companion_profiles')
    .upsert(row, { onConflict: 'workspace_id' });

  if (error) {
    throw new Error(error.message);
  }

  return normalized;
}

export async function countWorkspaceData(workspaceId: string): Promise<{
  referenceCount: number;
  generatedCount: number;
  hasProfile: boolean;
}> {
  const supabase = createUntypedAdminClient();

  const [reference, generated, profile] = await Promise.all([
    supabase
      .from('astra_reference_documents')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .from('astra_generated_documents')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .from('astra_companion_profiles')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  ]);

  if (reference.error) throw new Error(reference.error.message);
  if (generated.error) throw new Error(generated.error.message);
  if (profile.error) throw new Error(profile.error.message);

  return {
    referenceCount: reference.count ?? 0,
    generatedCount: generated.count ?? 0,
    hasProfile: Boolean(profile.data),
  };
}
