'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { HostUiContext } from './types.js';

export interface HostContextValue {
  context: HostUiContext;
  captureTarget?: string;
  getCaptureTargetRect: () => DOMRect | null;
}

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
  ...context
}: ChrystyHostContextProps) {
  const getCaptureTargetRect = useCallback((): DOMRect | null => {
    if (typeof document === 'undefined' || !captureTarget) return null;
    const el = document.querySelector(captureTarget);
    return el instanceof HTMLElement ? el.getBoundingClientRect() : null;
  }, [captureTarget]);

  const value = useMemo(
    (): HostContextValue => ({
      context,
      captureTarget,
      getCaptureTargetRect,
    }),
    [captureTarget, context, getCaptureTargetRect],
  );

  return <HostPageContext.Provider value={value}>{children}</HostPageContext.Provider>;
}
