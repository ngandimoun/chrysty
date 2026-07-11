import { type ReactNode } from 'react';
import { type LiveEmbedConfig } from './types.js';
interface LiveEmbedContextValue {
    openLive: () => Promise<void>;
    closeLive: () => void;
    isOpen: boolean;
    isConnecting: boolean;
    statusLine: string | null;
    hasHostContext: boolean;
}
export declare function useChrystyLiveEmbed(): LiveEmbedContextValue;
interface ChrystyLiveEmbedProviderProps extends LiveEmbedConfig {
    children: ReactNode;
}
export declare function ChrystyLiveEmbedProvider({ children, ...config }: ChrystyLiveEmbedProviderProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=provider.d.ts.map