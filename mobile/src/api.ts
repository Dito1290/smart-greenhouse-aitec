export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
    /** From the server's error body: whether trying again later can succeed. */
    readonly retryable?: boolean,
    readonly retryAfterSec?: number | null,
  ) {
    super(message);
  }
}

export interface Connection {
  baseUrl: string;
  token: string;
}

export function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

export async function apiRequest<T>(
  conn: Connection,
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number; auth?: boolean } = {},
): Promise<T> {
  if (!conn.baseUrl) throw new ApiError('not_configured', 'Alamat server belum diatur di Pengaturan.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000);
  let res: Response;
  try {
    res = await fetch(`${normalizeBaseUrl(conn.baseUrl)}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.auth === false ? {} : { Authorization: `Bearer ${conn.token}` }),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new ApiError('timeout', 'Server tidak merespons dalam batas waktu.');
    }
    throw new ApiError('network', 'Server tidak dapat dihubungi. Periksa jaringan dan alamat server.');
  } finally {
    clearTimeout(timer);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body (proxy error page, tunnel offline notice, ...).
  }
  if (!res.ok) {
    if (res.status === 401) throw new ApiError('unauthorized', 'Token akses ditolak server. Periksa token di Pengaturan.', 401);
    throw new ApiError(
      data?.error ?? 'http_error',
      data?.message ?? `Server membalas galat ${res.status}.`,
      res.status,
      typeof data?.retryable === 'boolean' ? data.retryable : undefined,
      typeof data?.retryAfterSec === 'number' ? data.retryAfterSec : null,
    );
  }
  return data as T;
}
