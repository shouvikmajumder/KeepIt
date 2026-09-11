import { supabase } from './supabase';

const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new ApiError('Your session has expired. Please sign in again.', 401);
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options, headers,
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('Unable to reach KeepIt. Check your connection and try again.');
  }
  if (response.status === 204) return undefined as T;
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = json?.detail;
    const message = response.status === 401 ? 'Your session has expired. Please sign in again.'
      : typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map((item: { msg?: string }) => item.msg || 'Invalid value').join('. ')
      : 'Something went wrong. Please try again.';
    throw new ApiError(message, response.status);
  }
  if (json === null) throw new ApiError('KeepIt returned an unexpected response. Please retry.');
  return json as T;
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
