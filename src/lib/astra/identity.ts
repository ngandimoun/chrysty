'use client';



import {

  ASTRA_KEY_CHANGED_EVENT,

  ASTRA_KEY_HEADER,

  ASTRA_KEY_STORAGE,

  ASTRA_PERSONAL_KEY_STORAGE,

  isSystemAstraKey,

} from '@/lib/astra/constants';



export function rememberPersonalAstraKey(key: string): void {

  if (typeof window === 'undefined' || !key.startsWith('ak_') || isSystemAstraKey(key)) return;

  window.localStorage.setItem(ASTRA_PERSONAL_KEY_STORAGE, key);

}



export function resolveActiveAstraKey(): string {

  if (typeof window === 'undefined') return '';



  const stored = getStoredAstraKey();

  if (stored?.startsWith('ak_') && !isSystemAstraKey(stored)) {

    return stored;

  }



  return '';

}



export function clearInvalidStoredAstraKey(): void {

  if (typeof window === 'undefined') return;

  const stored = getStoredAstraKey();

  if (stored && isSystemAstraKey(stored)) {

    window.localStorage.removeItem(ASTRA_KEY_STORAGE);

  }

}



export function getStoredAstraKey(): string | null {

  if (typeof window === 'undefined') return null;

  return window.localStorage.getItem(ASTRA_KEY_STORAGE);

}



export function getOrCreateAstraKey(): string {

  return resolveActiveAstraKey();

}



export function astraKeyHeaders(): HeadersInit {

  const key = resolveActiveAstraKey();

  return key ? { [ASTRA_KEY_HEADER]: key } : {};

}



export function uploadAstraKeyHeaders(): HeadersInit {

  return astraKeyHeaders();

}



export function setStoredAstraKey(key: string, options?: { allowSystemKey?: boolean }): void {

  if (typeof window === 'undefined' || !key.startsWith('ak_')) return;



  if (isSystemAstraKey(key) && !options?.allowSystemKey) {

    return;

  }



  window.localStorage.setItem(ASTRA_KEY_STORAGE, key);

  if (!isSystemAstraKey(key)) {

    rememberPersonalAstraKey(key);

  }

  window.dispatchEvent(new Event(ASTRA_KEY_CHANGED_EVENT));

}


