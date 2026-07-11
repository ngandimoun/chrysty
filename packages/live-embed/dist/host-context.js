'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, } from 'react';
const HostPageContext = createContext(null);
export function useChrystyHostContext() {
    return useContext(HostPageContext);
}
export function ChrystyHostContext({ captureTarget, children, ...context }) {
    const getCaptureTargetRect = useCallback(() => {
        if (typeof document === 'undefined' || !captureTarget)
            return null;
        const el = document.querySelector(captureTarget);
        return el instanceof HTMLElement ? el.getBoundingClientRect() : null;
    }, [captureTarget]);
    const value = useMemo(() => ({
        context,
        captureTarget,
        getCaptureTargetRect,
    }), [captureTarget, context, getCaptureTargetRect]);
    return _jsx(HostPageContext.Provider, { value: value, children: children });
}
