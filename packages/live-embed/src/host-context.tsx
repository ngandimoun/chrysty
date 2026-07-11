'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { registerHostContext } from './host-registry.js';
import type { HostContextValue, HostUiContext } from './types.js';

const HostPageContext = createContext<HostContextValue | null>(null);

export function useChrystyHostContext(): HostContextValue | null {
  return useContext(HostPageContext);
}

interface ChrystyHostContextProps extends HostUiContext {
  captureTarget?: string;
  children?: ReactNode;
}

export function ChrystyHostContext({
  captureTarget,
  children,
  source,
  entityId,
  title,
  selectedPassage,
  nearbyExcerpt,
  artifactLanguage,
  worker,
}: ChrystyHostContextProps) {
  const tokenRef = useRef(Symbol('chrysty-host-context'));

  const getCaptureTargetRect = useCallback((): DOMRect | null => {
    if (typeof document === 'undefined' || !captureTarget) return null;
    const el = document.querySelector(captureTarget);
    return el instanceof HTMLElement ? el.getBoundingClientRect() : null;
  }, [captureTarget]);

  const value = useMemo((): HostContextValue => {
    const context: HostUiContext = {
      title,
      ...(source !== undefined ? { source } : {}),
      ...(entityId !== undefined ? { entityId } : {}),
      ...(selectedPassage !== undefined ? { selectedPassage } : {}),
      ...(nearbyExcerpt !== undefined ? { nearbyExcerpt } : {}),
      ...(artifactLanguage !== undefined ? { artifactLanguage } : {}),
      ...(worker !== undefined ? { worker } : {}),
    };
    return {
      context,
      captureTarget,
      getCaptureTargetRect,
    };
  }, [
    artifactLanguage,
    captureTarget,
    entityId,
    getCaptureTargetRect,
    nearbyExcerpt,
    selectedPassage,
    source,
    title,
    worker,
  ]);

  useEffect(() => {
    return registerHostContext(tokenRef.current, value);
  }, [value]);

  return <HostPageContext.Provider value={value}>{children}</HostPageContext.Provider>;
}

export type { HostContextValue };
