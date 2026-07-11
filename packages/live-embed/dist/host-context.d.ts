import { type ReactNode } from 'react';
import type { HostContextValue, HostUiContext } from './types.js';
export declare function useChrystyHostContext(): HostContextValue | null;
interface ChrystyHostContextProps extends HostUiContext {
    captureTarget?: string;
    children?: ReactNode;
}
export declare function ChrystyHostContext({ captureTarget, children, source, entityId, title, selectedPassage, nearbyExcerpt, artifactLanguage, worker, }: ChrystyHostContextProps): import("react").JSX.Element;
export type { HostContextValue };
//# sourceMappingURL=host-context.d.ts.map