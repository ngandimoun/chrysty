export function getVideoTrack(stream: MediaStream | null | undefined): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null;
}

export function isTorchSupported(track: MediaStreamTrack | null | undefined): boolean {
  if (!track || typeof track.getCapabilities !== 'function') return false;

  const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
  return capabilities.torch === true;
}

export async function setTorch(track: MediaStreamTrack, enabled: boolean): Promise<void> {
  if (!isTorchSupported(track)) {
    throw new Error('Torch is not supported on this camera track.');
  }

  try {
    await track.applyConstraints({ torch: enabled } as MediaTrackConstraints & { torch?: boolean });
    return;
  } catch {
    // Fall through to advanced constraint shape used on some Android builds.
  }

  await track.applyConstraints({
    advanced: [{ torch: enabled }],
  } as unknown as MediaTrackConstraints);
}
