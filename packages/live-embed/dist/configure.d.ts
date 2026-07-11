import type { LiveEmbedConfig } from './types.js';
export declare function configureLiveEmbed(next: LiveEmbedConfig): void;
export declare function getLiveEmbedConfig(): LiveEmbedConfig;
export declare function buildEmbedLiveUrl(params: {
    worker: string;
    entityId?: string;
    title?: string;
}): string;
export declare function isAllowedChrystyOrigin(origin: string): boolean;
//# sourceMappingURL=configure.d.ts.map