import type { HostContextValue } from './types.js';
export type HostRegistrar = (token: symbol, value: HostContextValue) => () => void;
export declare function setHostRegistrar(next: HostRegistrar | null): void;
export declare function registerHostContext(token: symbol, value: HostContextValue): () => void;
//# sourceMappingURL=host-registry.d.ts.map