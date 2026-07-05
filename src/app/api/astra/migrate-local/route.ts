import { NextResponse } from 'next/server';

import { addGeneratedDocument, addReferenceDocument } from '@/lib/astra/db/documents';
import { countWorkspaceData, upsertCompanionProfile } from '@/lib/astra/db/profile';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { ensureAstraWorkspace } from '@/lib/astra/workspace';
import type { CompanionProfile } from '@/lib/client/companion-profile';
import { normalizeCompanionProfile } from '@/lib/client/companion-profile';
import type { GeneratedDocumentKind } from '@/lib/documents/generated-document-types';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const identity = await requireAstraIdentity(request);
    const workspace = await ensureAstraWorkspace(identity.astraKey, identity.userId);
    const counts = await countWorkspaceData(workspace.id);

    if (counts.referenceCount > 0 || counts.generatedCount > 0 || counts.hasProfile) {
      return NextResponse.json({ migrated: false, reason: 'remote-data-exists' });
    }

    const formData = await request.formData();
    const profileRaw = String(formData.get('profile') ?? '').trim();
    if (profileRaw) {
      const profile = normalizeCompanionProfile(JSON.parse(profileRaw) as CompanionProfile);
      await upsertCompanionProfile(workspace.id, identity.astraKey, profile, identity.userId);
    }

    const referenceMetaRaw = String(formData.get('referenceMeta') ?? '').trim();
    const referenceMeta = referenceMetaRaw
      ? (JSON.parse(referenceMetaRaw) as Array<{
          id: string;
          name: string;
          mimeType: string;
        }>)
      : [];

    for (const meta of referenceMeta) {
      const file = formData.get(`reference:${meta.id}`);
      if (!(file instanceof File)) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      await addReferenceDocument({
        workspaceId: workspace.id,
        astraKey: identity.astraKey,
        userId: identity.userId,
        name: meta.name,
        mimeType: meta.mimeType,
        buffer,
      });
    }

    const generatedMetaRaw = String(formData.get('generatedMeta') ?? '').trim();
    const generatedMeta = generatedMetaRaw
      ? (JSON.parse(generatedMetaRaw) as Array<{
          id: string;
          kind: GeneratedDocumentKind;
          title: string;
          mimeType?: string;
          jsonPayload?: string;
        }>)
      : [];

    for (const meta of generatedMeta) {
      const file = formData.get(`generated:${meta.id}`);
      const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : undefined;
      await addGeneratedDocument({
        workspaceId: workspace.id,
        astraKey: identity.astraKey,
        userId: identity.userId,
        id: meta.id,
        kind: meta.kind,
        title: meta.title,
        mimeType: meta.mimeType,
        jsonPayload: meta.jsonPayload,
        buffer,
      });
    }

    return NextResponse.json({ migrated: true });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Migration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
