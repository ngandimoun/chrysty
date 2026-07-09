'use client';

import { useCallback, useEffect, useState } from 'react';

import { isCoarsePointer } from '@/lib/device/is-ios';

export interface ViewportOrientation {
  isLandscape: boolean;
  orientationAngle: number;
  viewportWidth: number;
  viewportHeight: number;
  isCoarsePointer: boolean;
}

function readOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;

  if (typeof screen !== 'undefined' && screen.orientation?.angle != null) {
    return screen.orientation.angle;
  }

  const legacyOrientation = (window as Window & { orientation?: number }).orientation;
  if (typeof legacyOrientation === 'number') {
    return legacyOrientation;
  }

  return window.matchMedia('(orientation: landscape)').matches ? 90 : 0;
}

function readViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  const visualViewport = window.visualViewport;
  if (visualViewport) {
    return {
      width: visualViewport.width,
      height: visualViewport.height,
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function readViewportOrientation(): ViewportOrientation {
  const { width, height } = readViewportSize();
  const orientationAngle = readOrientationAngle();

  return {
    isLandscape: width > height,
    orientationAngle,
    viewportWidth: width,
    viewportHeight: height,
    isCoarsePointer: isCoarsePointer(),
  };
}

export function useViewportOrientation(): ViewportOrientation {
  const [state, setState] = useState<ViewportOrientation>(() => readViewportOrientation());

  const sync = useCallback(() => {
    setState(readViewportOrientation());
  }, []);

  useEffect(() => {
    sync();

    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', sync);
    visualViewport?.addEventListener('scroll', sync);

    const orientationMedia = window.matchMedia('(orientation: landscape)');
    const onOrientationMediaChange = () => sync();
    orientationMedia.addEventListener('change', onOrientationMediaChange);

    screen.orientation?.addEventListener('change', sync);

    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      visualViewport?.removeEventListener('resize', sync);
      visualViewport?.removeEventListener('scroll', sync);
      orientationMedia.removeEventListener('change', onOrientationMediaChange);
      screen.orientation?.removeEventListener('change', sync);
    };
  }, [sync]);

  return state;
}
