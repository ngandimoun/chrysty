'use client';

import { useEffect, useState } from 'react';

import { FocusAnnotationOverlay } from '@/components/astra/focus-annotation-overlay';
import { Button } from '@/components/ui/button';
import { burnFocusAnnotations } from '@/lib/camera/annotate';
import type { FocusAnnotation, PendingPhoto } from '@/lib/camera/types';

interface PhotoAnnotationEditorProps {
  photo: PendingPhoto;
  onClose: () => void;
  onSave: (photoId: string, annotations: FocusAnnotation[], annotatedBlob?: Blob) => void;
}

export function PhotoAnnotationEditor({ photo, onClose, onSave }: PhotoAnnotationEditorProps) {
  const [annotations, setAnnotations] = useState<FocusAnnotation[]>(photo.focusAnnotations);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [imageUrl] = useState(() => URL.createObjectURL(photo.blob));

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleDone = async () => {
    setIsSaving(true);
    setError(null);

    try {
      if (annotations.length === 0) {
        onSave(photo.id, []);
        onClose();
        return;
      }

      const result = await burnFocusAnnotations(photo.blob, annotations);
      onSave(photo.id, annotations, result.blob);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save annotation.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-4 rounded-3xl border border-cyan-400/20 bg-slate-950/95 p-4 shadow-[0_0_60px_rgba(31,213,249,0.12)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-cyan-100">Mark what the AI should focus on</p>
            <p className="text-xs text-slate-400">Drag to add marks, then tap one if you want to delete it.</p>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl border border-white/8 bg-slate-900/80 p-2">
          <div
            className="relative max-h-[68vh] max-w-full touch-none select-none overflow-hidden rounded-2xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Captured photo annotation preview"
              className="block max-h-[68vh] max-w-full object-contain"
              draggable={false}
            />
            <FocusAnnotationOverlay annotations={annotations} onChange={setAnnotations} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-h-5 text-sm text-amber-200">{error}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-slate-900/70 text-slate-100 hover:bg-slate-800"
            >
              Skip
            </Button>
            <Button
              type="button"
              onClick={() => void handleDone()}
              disabled={isSaving}
              className="rounded-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            >
              {isSaving ? 'Saving…' : 'Done'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
