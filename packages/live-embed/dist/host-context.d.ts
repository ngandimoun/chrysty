import { type ReactNode } from 'react';
import type { HostUiContext } from './types.js';
export interface HostContextValue {
    context: HostUiContext;
    captureTarget?: string;
    getCaptureTargetRect: () => DOMRect | null;
}
export declare function useChrystyHostContext(): HostContextValue | null;
interface ChrystyHostContextProps extends HostUiContext {
    captureTarget?: string;
    children?: ReactNode;
}
export declare function ChrystyHostContext({ captureTarget, children, ...context }: ChrystyHostContextProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=host-context.d.ts.map