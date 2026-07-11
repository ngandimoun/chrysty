import type { HostContextValue } from './types.js';

export type HostRegistrar = (
  token: symbol,
  value: HostContextValue,
) => () => void;

let registrar: HostRegistrar | null = null;

export function setHostRegistrar(next: HostRegistrar | null): void {
  registrar = next;
}

export function registerHostContext(
  token: symbol,
  value: HostContextValue,
): () => void {
  if (!registrar) return () => undefined;
  return registrar(token, value);
}
