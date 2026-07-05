'use client';

import { useState } from 'react';
import {
  Camera,
  CameraOff,
  FileText,
  LayoutGrid,
  Settings,
  Square,
  X,
} from 'lucide-react';

import { CameraToolButton, touchButtonClass } from '@/components/astra/camera-tool-button';
import { EcosystemSheet } from '@/components/astra/ecosystem-sheet';
import { SettingsSheet } from '@/components/astra/settings-sheet';
import { Button } from '@/components/ui/button';
import type { AgentState } from '@/hooks/use-voice-agent';
import type { AppAgentPhase } from '@/lib/agent-state';
import { cn } from '@/lib/utils';

interface VoiceControlsProps {
  phase: AppAgentPhase;
  isBusy: boolean;
  recordingDisabled?: boolean;
  agentState: AgentState;
  cameraActive: boolean;
  unreadDocumentCount?: number;
  onDisconnect: () => void;
  onToggleCamera: () => void;
  onToggleRecording: () => void;
  onCancelRecording: () => void;
  onOpenDocuments: () => void;
}

export function VoiceControls({
  phase,
  isBusy,
  recordingDisabled = false,
  agentState,
  cameraActive,
  unreadDocumentCount = 0,
  onDisconnect,
  onToggleCamera,
  onToggleRecording,
  onCancelRecording,
  onOpenDocuments,
}: VoiceControlsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ecosystemOpen, setEcosystemOpen] = useState(false);
  const isRecording = agentState === 'recording';
  const isActive = isRecording || (phase !== 'idle' && phase !== 'error');
  const isProcessing = agentState === 'processing' || (!isRecording && phase === 'thinking');
  const canRecord = isRecording || (phase !== 'connecting' && phase !== 'thinking');
  const documentsLabel =
    unreadDocumentCount > 0
      ? `Documents, ${unreadDocumentCount} unread`
      : 'Documents';

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex w-full items-center justify-center gap-3">
        <CameraToolButton
          active={cameraActive}
          disabled={!isActive || isBusy || isProcessing}
          onClick={onToggleCamera}
          ariaLabel={cameraActive ? 'Close camera' : 'Open camera'}
          ariaPressed={cameraActive}
        >
          {cameraActive ? <CameraOff className="size-5" /> : <Camera className="size-5" />}
        </CameraToolButton>

        {isRecording ? (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            disabled={isBusy}
            onClick={onCancelRecording}
            className={cn('min-w-40 rounded-full', touchButtonClass)}
          >
            <X className="size-4" />
            Cancel
          </Button>
        ) : isActive ? (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            disabled={isBusy || isProcessing}
            onClick={onDisconnect}
            className={cn('min-w-40 rounded-full', touchButtonClass)}
          >
            <Square className="size-4 fill-current" />
            End
          </Button>
        ) : null}

        <div className="relative">
          <CameraToolButton onClick={onOpenDocuments} ariaLabel={documentsLabel}>
            <FileText className="size-5" />
          </CameraToolButton>
          {unreadDocumentCount > 0 ? (
            <span
              className="pointer-events-none absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
              aria-hidden
            >
              {unreadDocumentCount > 99 ? '99+' : unreadDocumentCount}
            </span>
          ) : null}
        </div>
        <CameraToolButton onClick={() => setSettingsOpen(true)} ariaLabel="Settings">
          <Settings className="size-5" />
        </CameraToolButton>
        <CameraToolButton onClick={() => setEcosystemOpen(true)} ariaLabel="Chrysty apps">
          <LayoutGrid className="size-5" />
        </CameraToolButton>
        <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
        <EcosystemSheet open={ecosystemOpen} onOpenChange={setEcosystemOpen} />
      </div>

      <Button
        type="button"
        size="lg"
        disabled={recordingDisabled || !canRecord || isProcessing || isBusy}
        onClick={onToggleRecording}
        className={cn(
          touchButtonClass,
          'select-none',
          isRecording
            ? 'min-w-56 rounded-full bg-rose-500 text-white hover:bg-rose-400'
            : 'min-w-56 rounded-full bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        {isRecording ? 'Stop & send' : isProcessing ? 'Thinking…' : phase === 'connecting' ? 'Connecting…' : 'Record'}
      </Button>
    </div>
  );
}
