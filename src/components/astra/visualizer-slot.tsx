'use client';

import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import type { LocalAudioTrack } from 'livekit-client';

import { ExplanationCanvas } from '@/components/astra/explanation-canvas';
import { GeneratedDocumentViewer } from '@/components/astra/generated-document-viewer';
import type { AppAgentPhase } from '@/lib/agent-state';
import type { CameraAspectRatio, CameraFacing, FocusAnnotation } from '@/lib/camera/types';
import type { NumericRange } from '@/lib/camera/track-controls';
import type { GeneratedDocumentItem } from '@/hooks/use-generated-documents';
import type { ExplanationState } from '@/lib/streaming/types';

const AuraVisualizer = dynamic(
  () => import('@/components/astra/aura-visualizer').then((mod) => mod.AuraVisualizer),
  {
    ssr: false,
    loading: () => <div className="size-72 max-w-[min(80vw,20rem)] animate-pulse rounded-full bg-primary/10" />,
  },
);

const CameraPreview = dynamic(
  () => import('@/components/astra/camera-preview').then((mod) => mod.CameraPreview),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto aspect-video max-h-[min(70dvh,52rem)] w-[min(98vw,64rem)] animate-pulse rounded-3xl bg-muted" />
    ),
  },
);

interface VisualizerSlotProps {
  phase: AppAgentPhase;
  audioTrack?: LocalAudioTrack | null;
  explanation: ExplanationState;
  selectedDocument?: GeneratedDocumentItem | null;
  speakingDurationMs?: number | null;
  cameraStream?: MediaStream | null;
  cameraFacing?: CameraFacing;
  cameraAspectRatio?: CameraAspectRatio;
  onCameraVideoReady?: (video: HTMLVideoElement) => void;
  onDismissExplanation?: () => void;
  onDismissDocument?: () => void;
  onUpdateDocument?: (id: string, patch: { title?: string; fullText?: string }) => Promise<void>;
  onCopyDocument?: (id: string) => Promise<boolean>;
  onSaveExplanation?: () => void;
  saveExplanationDisabled?: boolean;
  isSavingExplanation?: boolean;
  pendingPhotoCount?: number;
  canFlipCamera?: boolean;
  canUseTorch?: boolean;
  torchOn?: boolean;
  zoom?: number;
  zoomRange?: NumericRange | null;
  canZoom?: boolean;
  exposureCompensation?: number;
  exposureRange?: NumericRange | null;
  canAdjustExposure?: boolean;
  canFocusAtPoint?: boolean;
  cameraControlsDisabled?: boolean;
  focusAnnotations?: FocusAnnotation[];
  onTakePhoto?: () => void;
  onFlipCamera?: () => void;
  onToggleTorch?: () => void;
  onZoomChange?: (value: number) => void;
  onExposureChange?: (value: number) => void;
  onAspectRatioChange?: (ratio: CameraAspectRatio) => void;
  onFocusAtPoint?: (x: number, y: number) => void;
  onFocusAnnotationsChange?: (annotations: FocusAnnotation[]) => void;
  /** When true the live camera stays the primary surface (Live Guide mode). */
  liveGuideActive?: boolean;
  liveGuideOverlay?: React.ReactNode;
}

export function VisualizerSlot({
  phase,
  audioTrack,
  explanation,
  selectedDocument = null,
  speakingDurationMs,
  cameraStream,
  cameraFacing = 'environment',
  cameraAspectRatio = '16:9',
  onCameraVideoReady,
  onDismissExplanation,
  onDismissDocument,
  onUpdateDocument,
  onCopyDocument,
  onSaveExplanation,
  saveExplanationDisabled,
  isSavingExplanation = false,
  pendingPhotoCount,
  canFlipCamera,
  canUseTorch,
  torchOn,
  zoom,
  zoomRange,
  canZoom,
  exposureCompensation,
  exposureRange,
  canAdjustExposure,
  canFocusAtPoint,
  cameraControlsDisabled,
  focusAnnotations,
  onTakePhoto,
  onFlipCamera,
  onToggleTorch,
  onZoomChange,
  onExposureChange,
  onAspectRatioChange,
  onFocusAtPoint,
  onFocusAnnotationsChange,
  liveGuideActive = false,
  liveGuideOverlay,
}: VisualizerSlotProps) {
  const showExplanation =
    !liveGuideActive &&
    explanation.active &&
    (explanation.fullText.length > 0 ||
      explanation.places.length > 0 ||
      explanation.charts.length > 0 ||
      explanation.codeImages.length > 0 ||
      explanation.stockImages.length > 0 ||
      explanation.webCitations.length > 0 ||
      explanation.physicalTask !== null ||
      explanation.visualGuidance !== null ||
      explanation.userImages.length > 0);
  const showCamera = Boolean(
    cameraStream && (liveGuideActive || (!showExplanation && !selectedDocument)),
  );

  return (
    <div className="relative flex w-full min-h-0 items-center justify-center">
      <AnimatePresence mode="wait">
        {selectedDocument && !showCamera ? (
          <motion.div
            key={`document-${selectedDocument.id}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full flex justify-center"
          >
            <GeneratedDocumentViewer
              document={selectedDocument}
              onDismiss={() => onDismissDocument?.()}
              onUpdate={onUpdateDocument}
              onCopy={onCopyDocument}
            />
          </motion.div>
        ) : showExplanation ? (
          <motion.div
            key="explanation"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full flex justify-center"
          >
            <ExplanationCanvas
              fullText={explanation.fullText}
              isStreaming={explanation.isStreaming}
              places={explanation.places}
              charts={explanation.charts}
              codeImages={explanation.codeImages}
              stockImages={explanation.stockImages}
              webCitations={explanation.webCitations}
              customToolCalls={explanation.customToolCalls}
              physicalTask={explanation.physicalTask}
              visualGuidance={explanation.visualGuidance}
              userImages={explanation.userImages}
              active={showExplanation}
              durationMs={speakingDurationMs}
              onDismiss={onDismissExplanation}
              onSave={onSaveExplanation}
              saveDisabled={saveExplanationDisabled}
              isSaving={isSavingExplanation}
            />
          </motion.div>
        ) : showCamera ? (
          <motion.div
            key="camera"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex justify-center"
          >
            <CameraPreview
              stream={cameraStream!}
              facing={cameraFacing}
              overlaySlot={liveGuideActive ? liveGuideOverlay : undefined}
              aspectRatio={cameraAspectRatio}
              onVideoReady={onCameraVideoReady}
              pendingPhotoCount={pendingPhotoCount}
              canFlipCamera={canFlipCamera}
              canUseTorch={canUseTorch}
              torchOn={torchOn}
              zoom={zoom}
              zoomRange={zoomRange}
              canZoom={canZoom}
              exposureCompensation={exposureCompensation}
              exposureRange={exposureRange}
              canAdjustExposure={canAdjustExposure}
              canFocusAtPoint={canFocusAtPoint}
              controlsDisabled={cameraControlsDisabled}
              focusAnnotations={focusAnnotations}
              onTakePhoto={onTakePhoto}
              onFlipCamera={onFlipCamera}
              onToggleTorch={onToggleTorch}
              onZoomChange={onZoomChange}
              onExposureChange={onExposureChange}
              onAspectRatioChange={onAspectRatioChange}
              onFocusAtPoint={onFocusAtPoint}
              onFocusAnnotationsChange={onFocusAnnotationsChange}
            />
          </motion.div>
        ) : (
          <motion.div
            key="aura"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex justify-center"
          >
            <AuraVisualizer phase={phase} audioTrack={audioTrack} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
