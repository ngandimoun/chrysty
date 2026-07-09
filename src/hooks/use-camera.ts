'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_CAMERA_ASPECT_RATIO } from '@/lib/camera/aspect-ratio';
import {
  acquireVideoStream,
  hasMultipleCameras,
  releaseVideoStream,
  switchVideoFacing,
} from '@/lib/camera/camera';
import { burnFocusAnnotations } from '@/lib/camera/annotate';
import { scoreVideoFrame } from '@/lib/camera/capture';
import { prepareVideoFrameForModel } from '@/lib/camera/encode';
import { FrameBuffer } from '@/lib/camera/frame-buffer';
import { getVideoTrack, isTorchSupported, setTorch } from '@/lib/camera/torch';
import {
  focusAtPoint as applyFocusAtPoint,
  getExposureState,
  getZoomState,
  isFocusPointSupported,
  setExposureCompensation as applyExposureCompensation,
  setZoom as applyZoom,
  type NumericRange,
} from '@/lib/camera/track-controls';
import type {
  CameraAspectRatio,
  CameraFacing,
  CapturedFrame,
  FocusAnnotation,
  PendingPhoto,
} from '@/lib/camera/types';
import { CameraError, MAX_PENDING_PHOTOS } from '@/lib/camera/types';
import {
  canAdjustZoom,
  getEffectiveZoomRange,
  getHardwareZoomRange,
  resolveDefaultZoom,
  splitZoom,
  type HardwareZoomRange,
} from '@/lib/camera/zoom-model';
import { createUuid } from '@/lib/ids';
import { useViewportOrientation } from '@/hooks/use-viewport-orientation';
import { isPhoneSizedDevice } from '@/lib/device/is-ios';

interface UseCameraResult {
  stream: MediaStream | null;
  isActive: boolean;
  facing: CameraFacing;
  aspectRatio: CameraAspectRatio;
  canFlip: boolean;
  torchOn: boolean;
  canUseTorch: boolean;
  zoom: number;
  digitalScale: number;
  zoomRange: NumericRange | null;
  canZoom: boolean;
  exposureCompensation: number;
  exposureRange: NumericRange | null;
  canAdjustExposure: boolean;
  canFocusAtPoint: boolean;
  pendingPhotos: PendingPhoto[];
  openCamera: () => Promise<void>;
  closeCamera: () => void;
  toggleSelfie: () => Promise<void>;
  toggleTorch: () => Promise<void>;
  setZoom: (value: number) => Promise<void>;
  setExposureCompensation: (value: number) => Promise<void>;
  setAspectRatio: (ratio: CameraAspectRatio) => Promise<void>;
  focusAtPoint: (x: number, y: number) => Promise<void>;
  takePhoto: (focusAnnotations?: FocusAnnotation[]) => Promise<void>;
  updatePendingPhoto: (id: string, patch: Partial<PendingPhoto>) => void;
  removePendingPhoto: (id: string) => void;
  clearPendingPhotos: () => void;
  startFrameSampling: (video: HTMLVideoElement) => void;
  stopFrameSamplingAndPickBest: () => Promise<CapturedFrame | null>;
  cancelFrameSampling: () => void;
  consumePendingPhotos: () => PendingPhoto[];
}

export function useCamera(): UseCameraResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const [aspectRatio, setAspectRatioState] = useState<CameraAspectRatio>(DEFAULT_CAMERA_ASPECT_RATIO);
  const [canFlip, setCanFlip] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [canUseTorch, setCanUseTorch] = useState(false);
  const [zoom, setZoomState] = useState(1);
  const [digitalScale, setDigitalScale] = useState(1);
  const [zoomRange, setZoomRange] = useState<NumericRange | null>(null);
  const [canZoom, setCanZoom] = useState(false);
  const [exposureCompensation, setExposureCompensationState] = useState(0);
  const [exposureRange, setExposureRange] = useState<NumericRange | null>(null);
  const [canAdjustExposure, setCanAdjustExposure] = useState(false);
  const [canFocusAtPoint, setCanFocusAtPoint] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const pendingPhotosRef = useRef<PendingPhoto[]>([]);
  const frameBufferRef = useRef(new FrameBuffer());
  const torchOnRef = useRef(false);
  const facingRef = useRef<CameraFacing>('environment');
  const aspectRatioRef = useRef<CameraAspectRatio>(DEFAULT_CAMERA_ASPECT_RATIO);
  const isLandscapeRef = useRef(false);
  const prevLandscapeRef = useRef(false);
  const orientationRefreshTimerRef = useRef<number | null>(null);
  const hardwareZoomRangeRef = useRef<HardwareZoomRange>({
    supported: false,
    min: 1,
    max: 1,
    step: 0.1,
  });
  const digitalScaleRef = useRef(1);

  const { isLandscape, viewportWidth, viewportHeight } = useViewportOrientation();

  useEffect(() => {
    pendingPhotosRef.current = pendingPhotos;
  }, [pendingPhotos]);

  useEffect(() => {
    facingRef.current = facing;
  }, [facing]);

  useEffect(() => {
    aspectRatioRef.current = aspectRatio;
  }, [aspectRatio]);

  const syncTorchCapability = useCallback((nextStream: MediaStream, nextFacing: CameraFacing) => {
    const track = getVideoTrack(nextStream);
    const supported = nextFacing === 'environment' && isTorchSupported(track);
    torchOnRef.current = false;
    setTorchOn(false);
    setCanUseTorch(supported);
  }, []);

  const applyZoomState = useCallback((displayZoom: number, nextDigitalScale: number) => {
    digitalScaleRef.current = nextDigitalScale;
    setDigitalScale(nextDigitalScale);
    setZoomState(displayZoom);
  }, []);

  const syncTrackCapabilities = useCallback((nextStream: MediaStream) => {
    const track = getVideoTrack(nextStream);
    const zoomState = getZoomState(track);
    const exposureState = getExposureState(track);
    const hardwareRange = getHardwareZoomRange(zoomState);

    hardwareZoomRangeRef.current = hardwareRange;
    setCanZoom(canAdjustZoom(hardwareRange));
    setZoomRange(getEffectiveZoomRange(hardwareRange));

    setCanAdjustExposure(exposureState.supported);
    setExposureRange(
      exposureState.supported
        ? { min: exposureState.min, max: exposureState.max, step: exposureState.step }
        : null,
    );
    setExposureCompensationState(exposureState.current);
    setCanFocusAtPoint(isFocusPointSupported(track));
  }, []);

  const resetZoomToDefault = useCallback(async (nextStream: MediaStream) => {
    const track = getVideoTrack(nextStream);
    const hardwareRange = hardwareZoomRangeRef.current;

    if (!track || !canAdjustZoom(hardwareRange)) {
      applyZoomState(1, 1);
      return;
    }

    const targetZoom = resolveDefaultZoom(hardwareRange);
    const split = splitZoom(targetZoom, hardwareRange);

    if (hardwareRange.supported) {
      try {
        await applyZoom(track, split.hardwareZoom);
      } catch {
        // Keep the current hardware zoom if reset fails.
      }
    }

    applyZoomState(split.displayZoom, split.digitalScale);
  }, [applyZoomState]);

  const turnOffTorch = useCallback(async (activeStream: MediaStream | null) => {
    if (!torchOnRef.current) return;

    const track = getVideoTrack(activeStream);
    if (track) {
      try {
        await setTorch(track, false);
      } catch {
        // Track may already be stopping.
      }
    }

    torchOnRef.current = false;
    setTorchOn(false);
  }, []);

  const closeCamera = useCallback(() => {
    frameBufferRef.current.stop();
    const activeStream = streamRef.current;
    const track = getVideoTrack(activeStream);
    if (track && torchOnRef.current) {
      void setTorch(track, false).catch(() => {});
    }
    torchOnRef.current = false;
    setTorchOn(false);
    setCanUseTorch(false);
    setCanZoom(false);
    setZoomRange(null);
    applyZoomState(1, 1);
    setCanAdjustExposure(false);
    setExposureRange(null);
    setExposureCompensationState(0);
    setCanFocusAtPoint(false);
    releaseVideoStream(activeStream);
    streamRef.current = null;
    setStream(null);
  }, [applyZoomState]);

  const attachStream = useCallback(
    (nextStream: MediaStream, nextFacing: CameraFacing) => {
      streamRef.current = nextStream;
      setStream(nextStream);
      setFacing(nextFacing);
      syncTorchCapability(nextStream, nextFacing);
      syncTrackCapabilities(nextStream);
      void resetZoomToDefault(nextStream);
    },
    [resetZoomToDefault, syncTorchCapability, syncTrackCapabilities],
  );

  const getStreamOptions = useCallback(
    () => ({ isLandscape: isLandscapeRef.current }),
    [],
  );

  const openCamera = useCallback(async () => {
    try {
      closeCamera();
      const nextStream = await acquireVideoStream(
        facingRef.current,
        aspectRatioRef.current,
        getStreamOptions(),
      );
      attachStream(nextStream, facingRef.current);
      setCanFlip(await hasMultipleCameras());
    } catch (error) {
      closeCamera();
      throw error instanceof CameraError ? error : new CameraError('unknown', 'Could not open camera.');
    }
  }, [attachStream, closeCamera, getStreamOptions]);

  const toggleSelfie = useCallback(async () => {
    const nextFacing: CameraFacing = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      if (facingRef.current === 'environment') {
        await turnOffTorch(streamRef.current);
      }

      const nextStream = await switchVideoFacing(
        streamRef.current,
        nextFacing,
        aspectRatioRef.current,
        getStreamOptions(),
      );
      attachStream(nextStream, nextFacing);
    } catch (error) {
      throw error instanceof CameraError ? error : new CameraError('unknown', 'Could not switch camera.');
    }
  }, [attachStream, getStreamOptions, turnOffTorch]);

  const setAspectRatio = useCallback(
    async (ratio: CameraAspectRatio) => {
      if (ratio === aspectRatioRef.current && streamRef.current) {
        return;
      }

      try {
        await turnOffTorch(streamRef.current);
        const nextStream = await switchVideoFacing(
          streamRef.current,
          facingRef.current,
          ratio,
          getStreamOptions(),
        );
        aspectRatioRef.current = ratio;
        setAspectRatioState(ratio);
        attachStream(nextStream, facingRef.current);
      } catch (error) {
        throw error instanceof CameraError
          ? error
          : new CameraError('unknown', 'Could not change aspect ratio.');
      }
    },
    [attachStream, getStreamOptions, turnOffTorch],
  );

  useEffect(() => {
    isLandscapeRef.current = isLandscape;
  }, [isLandscape]);

  useEffect(() => {
    if (!streamRef.current) {
      prevLandscapeRef.current = isLandscape;
      return;
    }

    if (prevLandscapeRef.current === isLandscape) {
      return;
    }

    prevLandscapeRef.current = isLandscape;

    if (!isPhoneSizedDevice(viewportWidth, viewportHeight)) {
      return;
    }

    if (orientationRefreshTimerRef.current !== null) {
      window.clearTimeout(orientationRefreshTimerRef.current);
    }

    orientationRefreshTimerRef.current = window.setTimeout(() => {
      const activeStream = streamRef.current;
      if (!activeStream) return;

      void (async () => {
        try {
          await turnOffTorch(activeStream);
          const nextStream = await switchVideoFacing(
            activeStream,
            facingRef.current,
            aspectRatioRef.current,
            getStreamOptions(),
          );
          attachStream(nextStream, facingRef.current);
        } catch {
          // Rely on CSS layout if stream refresh fails on rotation.
        }
      })();
    }, 300);

    return () => {
      if (orientationRefreshTimerRef.current !== null) {
        window.clearTimeout(orientationRefreshTimerRef.current);
        orientationRefreshTimerRef.current = null;
      }
    };
  }, [attachStream, getStreamOptions, isLandscape, turnOffTorch, viewportHeight, viewportWidth]);

  const toggleTorch = useCallback(async () => {
    const track = getVideoTrack(streamRef.current);
    if (!track || facingRef.current !== 'environment' || !isTorchSupported(track)) {
      throw new CameraError('not-supported', 'Flashlight is not available on this device.');
    }

    const nextTorchOn = !torchOnRef.current;

    try {
      await setTorch(track, nextTorchOn);
      torchOnRef.current = nextTorchOn;
      setTorchOn(nextTorchOn);
    } catch {
      throw new CameraError('not-supported', 'Flashlight is not available on this device.');
    }
  }, []);

  const setZoom = useCallback(async (value: number) => {
    const hardwareRange = hardwareZoomRangeRef.current;
    if (!canAdjustZoom(hardwareRange)) {
      throw new CameraError('not-supported', 'Zoom is not available on this device.');
    }

    const split = splitZoom(value, hardwareRange);
    const track = getVideoTrack(streamRef.current);

    if (hardwareRange.supported && track) {
      try {
        await applyZoom(track, split.hardwareZoom);
      } catch {
        throw new CameraError('not-supported', 'Zoom is not available on this device.');
      }
    }

    applyZoomState(split.displayZoom, split.digitalScale);
  }, [applyZoomState]);

  const setExposureCompensation = useCallback(async (value: number) => {
    const track = getVideoTrack(streamRef.current);
    if (!track || !getExposureState(track).supported) {
      throw new CameraError('not-supported', 'Exposure adjustment is not available on this device.');
    }

    try {
      const nextValue = await applyExposureCompensation(track, value);
      setExposureCompensationState(nextValue);
    } catch {
      throw new CameraError('not-supported', 'Exposure adjustment is not available on this device.');
    }
  }, []);

  const focusAtPointHandler = useCallback(async (x: number, y: number) => {
    const track = getVideoTrack(streamRef.current);
    if (!track || !isFocusPointSupported(track)) {
      return;
    }

    try {
      await applyFocusAtPoint(track, { x, y });
    } catch {
      // Silently ignore unsupported focus attempts.
    }
  }, []);

  const takePhoto = useCallback(async (focusAnnotations: FocusAnnotation[] = []) => {
    if (pendingPhotosRef.current.length >= MAX_PENDING_PHOTOS) {
      throw new CameraError('limit-reached', `You can capture up to ${MAX_PENDING_PHOTOS} photos. Remove one to add another.`);
    }

    const video = document.querySelector<HTMLVideoElement>('[data-camera-preview]');
    if (!video || !streamRef.current) {
      throw new CameraError('unknown', 'Camera preview is not ready.');
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new CameraError('unknown', 'Could not capture photo. Try holding the camera steady.');
    }

    const frameScore = scoreVideoFrame(video);
    if (!frameScore) {
      throw new CameraError('unknown', 'Could not capture photo. Try holding the camera steady.');
    }

    const prepared = await prepareVideoFrameForModel(video, {
      digitalScale: digitalScaleRef.current,
    });
    if (!prepared) {
      throw new CameraError('unknown', 'Could not capture photo. Try holding the camera steady.');
    }

    const annotated =
      focusAnnotations.length > 0 ? await burnFocusAnnotations(prepared.blob, focusAnnotations) : null;

    const photo: PendingPhoto = {
      id: createUuid(),
      blob: prepared.blob,
      ...(annotated ? { annotatedBlob: annotated.blob } : {}),
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      mode: 'photo',
      focusAnnotations,
    };

    setPendingPhotos((current) => [...current, photo]);
  }, []);

  const removePendingPhoto = useCallback((id: string) => {
    setPendingPhotos((current) => current.filter((photo) => photo.id !== id));
  }, []);

  const updatePendingPhoto = useCallback((id: string, patch: Partial<PendingPhoto>) => {
    setPendingPhotos((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)),
    );
  }, []);

  const clearPendingPhotos = useCallback(() => {
    setPendingPhotos([]);
  }, []);

  const consumePendingPhotos = useCallback((): PendingPhoto[] => {
    const photos = pendingPhotosRef.current;
    pendingPhotosRef.current = [];
    setPendingPhotos([]);
    return photos;
  }, []);

  const startFrameSampling = useCallback((video: HTMLVideoElement) => {
    frameBufferRef.current.start(video, {
      getDigitalScale: () => digitalScaleRef.current,
    });
  }, []);

  const stopFrameSamplingAndPickBest = useCallback(async (): Promise<CapturedFrame | null> => {
    return frameBufferRef.current.stopAsync();
  }, []);

  const cancelFrameSampling = useCallback(() => {
    frameBufferRef.current.stop();
  }, []);

  useEffect(() => {
    return () => {
      closeCamera();
    };
  }, [closeCamera]);

  return {
    stream,
    isActive: stream !== null,
    facing,
    aspectRatio,
    canFlip,
    torchOn,
    canUseTorch,
    zoom,
    digitalScale,
    zoomRange,
    canZoom,
    exposureCompensation,
    exposureRange,
    canAdjustExposure,
    canFocusAtPoint,
    pendingPhotos,
    openCamera,
    closeCamera,
    toggleSelfie,
    toggleTorch,
    setZoom,
    setExposureCompensation,
    setAspectRatio,
    focusAtPoint: focusAtPointHandler,
    takePhoto,
    updatePendingPhoto,
    removePendingPhoto,
    clearPendingPhotos,
    startFrameSampling,
    stopFrameSamplingAndPickBest,
    cancelFrameSampling,
    consumePendingPhotos,
  };
}
