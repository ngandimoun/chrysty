'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, } from 'react';
import { registerHostContext } from './host-registry.js';
const HostPageContext = createContext(null);
export function useChrystyHostContext() {
    return useContext(HostPageContext);
}
export function ChrystyHostContext({ captureTarget, children, source, entityId, title, selectedPassage, nearbyExcerpt, artifactLanguage, worker, }) {
    const tokenRef = useRef(Symbol('chrysty-host-context'));
    const getCaptureTargetRect = useCallback(() => {
        if (typeof document === 'undefined' || !captureTarget)
            return null;
        const el = document.querySelector(captureTarget);
        return el instanceof HTMLElement ? el.getBoundingClientRect() : null;
    }, [captureTarget]);
    const value = useMemo(() => {
        const context = {
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
    return _jsx(HostPageContext.Provider, { value: value, children: children });
}
