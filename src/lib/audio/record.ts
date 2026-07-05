import { isSafariOctetStreamBlob } from '@/lib/audio/mime';

const RECORDER_TIMESLICE_MS = 1000;

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface AudioRecorder {
  start: () => void;
  stop: () => Promise<RecordedAudio>;
  isRecording: () => boolean;
}

export function createAudioRecorder(stream: MediaStream, mimeType: string): AudioRecorder {
  let recorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let startedAt = 0;
  let activeAudioTrack: MediaStreamTrack | null = null;
  let wasInterrupted = false;

  const markInterrupted = () => {
    wasInterrupted = true;
  };

  const detachTrackListeners = () => {
    if (!activeAudioTrack) return;
    activeAudioTrack.removeEventListener('ended', markInterrupted);
    activeAudioTrack.removeEventListener('mute', markInterrupted);
    activeAudioTrack = null;
  };

  const cleanup = () => {
    detachTrackListeners();
    recorder = null;
    chunks = [];
    startedAt = 0;
    wasInterrupted = false;
  };

  const resolveMimeType = (blob: Blob): string => {
    if (blob.type && !isSafariOctetStreamBlob(blob)) {
      return blob.type;
    }
    return mimeType;
  };

  return {
    start() {
      if (recorder?.state === 'recording') return;

      const liveAudioTrack = stream.getAudioTracks().find((track) => track.readyState === 'live');
      if (!liveAudioTrack) {
        cleanup();
        throw new Error('Microphone is no longer available. Reconnect and try again.');
      }

      chunks = [];
      startedAt = performance.now();
      wasInterrupted = false;
      activeAudioTrack = liveAudioTrack;
      activeAudioTrack.addEventListener('ended', markInterrupted);
      activeAudioTrack.addEventListener('mute', markInterrupted);

      try {
        recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.start(RECORDER_TIMESLICE_MS);
      } catch (error) {
        cleanup();
        throw error;
      }
    },

    isRecording() {
      return recorder?.state === 'recording';
    },

    stop() {
      return new Promise<RecordedAudio>((resolve, reject) => {
        if (!recorder) {
          reject(new Error('Recorder has not been started.'));
          return;
        }

        const activeRecorder = recorder;
        let settled = false;

        const rejectWithCleanup = (error: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };

        activeRecorder.onerror = () => {
          rejectWithCleanup(new Error('Recording failed.'));
        };

        const resolveWithRecording = () => {
          if (settled) return;
          settled = true;
          const durationMs = Math.max(0, performance.now() - startedAt);
          const blob = new Blob(chunks, { type: mimeType });
          const interrupted = wasInterrupted || activeAudioTrack?.readyState !== 'live';
          const resolvedMimeType = resolveMimeType(blob);
          cleanup();

          if (blob.size === 0 && interrupted) {
            reject(new Error('Microphone was interrupted. Tap Record and try again.'));
            return;
          }

          resolve({
            blob,
            mimeType: resolvedMimeType,
            durationMs,
          });
        };

        activeRecorder.onstop = resolveWithRecording;

        if (activeRecorder.state === 'inactive') {
          resolveWithRecording();
          return;
        }

        if (activeRecorder.state === 'recording') {
          try {
            activeRecorder.requestData();
          } catch {
            // Some browsers throw if the recorder is already flushing or stopping.
          }
        }

        activeRecorder.stop();
      });
    },
  };
}
