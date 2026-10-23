import type {
  DesignKind,
  DesignMeta,
  DesignStats,
  GalleryPage,
  ReportReason,
  Visibility,
} from '@ericmotors/schema';

/**
 * Schlanker Client für die Cloud-API. Fehler werden auf stabile Codes abgebildet, die die
 * Oberfläche übersetzt. Die lokale Arbeit (IndexedDB) hängt nie von der Cloud ab.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export interface PublicUser {
  id: string;
  username: string;
  designCount: number;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  contentType = 'application/json',
): Promise<T> {
  let res: Response;
  try {
    const init: RequestInit = { method, credentials: 'same-origin' };
    if (body !== undefined) {
      init.headers = { 'content-type': contentType };
      init.body = body instanceof Blob ? body : JSON.stringify(body);
    }
    res = await fetch(path, init);
  } catch {
    throw new ApiError('offline', 0);
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Cloudflare-Fehlerseiten (z. B. 1027 Tageslimit) sind HTML.
  }
  if (!res.ok) {
    const code =
      typeof json.error === 'string'
        ? json.error
        : res.status === 429 || text.includes('1027')
          ? 'rate_limited'
          : res.status >= 500
            ? 'unavailable'
            : 'error';
    throw new ApiError(code, res.status, json);
  }
  return json as T;
}

export const api = {
  me: () => request<{ user: PublicUser | null; authAvailable: boolean }>('GET', '/api/me'),
  register: (username: string, key: string) =>
    request<{ user: PublicUser }>('POST', '/api/auth/register', { username, key }),
  login: (username: string, key: string) =>
    request<{ user: PublicUser }>('POST', '/api/auth/login', { username, key }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout', {}),
  changePassword: (oldKey: string, newKey: string) =>
    request<{ ok: true }>('POST', '/api/auth/password', { oldKey, newKey }),
  deleteAccount: () => request<{ ok: true }>('DELETE', '/api/me'),

  saveDesign: (
    id: string,
    body: { kind: DesignKind; visibility: Visibility; doc: unknown; stats: DesignStats },
  ) => request<{ design: DesignMeta }>('PUT', `/api/designs/${id}`, body),
  uploadThumb: (id: string, image: Blob) =>
    request<{ ok: true }>('PUT', `/api/designs/${id}/thumb`, image, 'image/webp'),
  deleteDesign: (id: string) => request<{ ok: true }>('DELETE', `/api/designs/${id}`),
  myDesigns: () => request<{ items: DesignMeta[] }>('GET', '/api/designs'),
  design: (id: string) => request<{ design: DesignMeta }>('GET', `/api/designs/${id}`),
  designData: <T>(id: string, version: number) =>
    request<T>('GET', `/api/designs/${id}/data?v=${version}`),
  gallery: (query: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== '') params.set(k, String(v));
    return request<GalleryPage>('GET', `/api/gallery?${params}`);
  },
  userDesigns: (username: string) =>
    request<{ items: DesignMeta[] }>('GET', `/api/users/${encodeURIComponent(username)}/designs`),
  like: (id: string) =>
    request<{ likes: number; likedByMe: boolean }>('POST', `/api/designs/${id}/like`, {}),
  unlike: (id: string) =>
    request<{ likes: number; likedByMe: boolean }>('DELETE', `/api/designs/${id}/like`),
  report: (id: string, reason: ReportReason) =>
    request<{ ok: true }>('POST', `/api/designs/${id}/report`, { reason }),
};

export const thumbUrl = (d: Pick<DesignMeta, 'id' | 'thumbVersion'>) =>
  d.thumbVersion === null ? undefined : `/api/designs/${d.id}/thumb?v=${d.thumbVersion}`;
