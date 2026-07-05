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
import { createUuid } from '@/lib/ids';

interface UseCameraResult {
  stream: MediaStream | null;
  isActive: boolean;
  facing: CameraFacing;
  aspectRatio: CameraAspectRatio;
  canFlip: boolean;
  torchOn: boolean;
  canUseTorch: boolean;
  zoom: number;
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

  const syncTrackCapabilities = useCallback((nextStream: MediaStream) => {
    const track = getVideoTrack(nextStream);
    const zoomState = getZoomState(track);
    const exposureState = getExposureState(track);

    setCanZoom(zoomState.supported);
    setZoomRange(
      zoomState.supported
        ? { min: zoomState.min, max: zoomState.max, step: zoomState.step }
        : null,
    );
    setZoomState(zoomState.current);

    setCanAdjustExposure(exposureState.supported);
    setExposureRange(
      exposureState.supported
        ? { min: exposureState.min, max: exposureState.max, step: exposureState.step }
        : null,
    );
    setExposureCompensationState(exposureState.current);
    setCanFocusAtPoint(isFocusPointSupported(track));
  }, []);

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
    setZoomState(1);
    setCanAdjustExposure(false);
    setExposureRange(null);
    setExposureCompensationState(0);
    setCanFocusAtPoint(false);
    releaseVideoStream(activeStream);
    streamRef.current = null;
    setStream(null);
  }, []);

  const attachStream = useCallback(
    (nextStream: MediaStream, nextFacing: CameraFacing) => {
      streamRef.current = nextStream;
      setStream(nextStream);
      setFacing(nextFacing);
      syncTorchCapability(nextStream, nextFacing);
      syncTrackCapabilities(nextStream);
    },
    [syncTorchCapability, syncTrackCapabilities],
  );

  const openCamera = useCallback(async () => {
    try {
      closeCamera();
      const nextStream = await acquireVideoStream(facingRef.current, aspectRatioRef.current);
      attachStream(nextStream, facingRef.current);
      setCanFlip(await hasMultipleCameras());
    } catch (error) {
      closeCamera();
      throw error instanceof CameraError ? error : new CameraError('unknown', 'Could not open camera.');
    }
  }, [attachStream, closeCamera]);

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
      );
      attachStream(nextStream, nextFacing);
    } catch (error) {
      throw error instanceof CameraError ? error : new CameraError('unknown', 'Could not switch camera.');
    }
  }, [attachStream, turnOffTorch]);

  const setAspectRatio = useCallback(
    async (ratio: CameraAspectRatio) => {
      if (ratio === aspectRatioRef.current && streamRef.current) {
        return;
      }

      try {
        await turnOffTorch(streamRef.current);
        const nextStream = await switchVideoFacing(streamRef.current, facingRef.current, ratio);
        aspectRatioRef.current = ratio;
        setAspectRatioState(ratio);
        attachStream(nextStream, facingRef.current);
      } catch (error) {
        throw error instanceof CameraError
          ? error
          : new CameraError('unknown', 'Could not change aspect ratio.');
      }
    },
    [attachStream, turnOffTorch],
  );

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
    const track = getVideoTrack(streamRef.current);
    if (!track || !getZoomState(track).supported) {
      throw new CameraError('not-supported', 'Zoom is not available on this device.');
    }

    try {
      const nextZoom = await applyZoom(track, value);
      setZoomState(nextZoom);
    } catch {
      throw new CameraError('not-supported', 'Zoom is not available on this device.');
    }
  }, []);

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

    const prepared = await prepareVideoFrameForModel(video);
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
    frameBufferRef.current.start(video);
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
