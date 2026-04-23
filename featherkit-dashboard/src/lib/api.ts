const DEFAULT_API_URL = 'http://localhost:7721';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL;
}

const SESSION_STORAGE_KEY = 'fk-token';

declare global {
  interface Window {
    __FEATHERKIT_TOKEN__?: string;
  }
}

/**
 * Resolve the API auth token from multiple sources in priority order:
 *   1. VITE_API_TOKEN env var (build-time — dev override)
 *   2. window.__FEATHERKIT_TOKEN__ (runtime injection — for serve-b static serving)
 *   3. sessionStorage (persisted from a previous URL param)
 *   4. ?token= URL query parameter (one-time — stripped after capture)
 *
 * If the token comes from the URL param, it is persisted to sessionStorage
 * and the param is removed from the address bar via history.replaceState.
 */
export function getApiToken(): string {
  // 1. Build-time env var (existing dev override)
  const envToken = import.meta.env.VITE_API_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  // Only attempt browser APIs if window is available (not SSR/test)
  if (typeof window === 'undefined') {
    throw new Error(
      'Missing API token. Set VITE_API_TOKEN in .env.local or open the dashboard via the URL printed by `feather serve`.',
    );
  }

  // 2. Runtime injection by server (serve-b)
  const runtimeToken = window.__FEATHERKIT_TOKEN__;
  if (typeof runtimeToken === 'string' && runtimeToken.trim()) {
    return runtimeToken.trim();
  }

  // 3. SessionStorage (persisted from a previous URL param)
  const storedToken = sessionStorage.getItem(SESSION_STORAGE_KEY)?.trim();
  if (storedToken) {
    return storedToken;
  }

  // 4. URL query parameter — capture, persist, and clean
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token')?.trim();
  if (urlToken) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, urlToken);

    // Strip token from the URL so it isn't shared/bookmarked
    params.delete('token');
    const cleanSearch = params.toString();
    const cleanUrl =
      window.location.pathname +
      (cleanSearch ? `?${cleanSearch}` : '') +
      window.location.hash;

    if (typeof history !== 'undefined') {
      history.replaceState(null, '', cleanUrl);
    }

    return urlToken;
  }

  throw new Error(
    'Missing API token. Set VITE_API_TOKEN in .env.local or open the dashboard via the URL printed by `feather serve`.',
  );
}

export function getWebSocketUrl(): string {
  const baseUrl = new URL(getApiBaseUrl());
  baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  baseUrl.pathname = '/events';
  baseUrl.search = '';
  baseUrl.hash = '';
  return baseUrl.toString();
}

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${normalizePath(path)}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) {
        throw new Error(`Invalid JSON response for ${method} ${path}`);
      }
    }
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `${method} ${path} failed with ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>('GET', path);
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>('PATCH', path, body);
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>('PUT', path, body);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>('POST', path, body);
}
