/** Bindings und Variablen aus `wrangler.jsonc` (Produktion und `previews`-Block). */
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  WRITE_LIMITER: RateLimit;
  AUTH_LIMITER: RateLimit;
  /** Secret (wrangler secret put SESSION_SECRET), signiert Session-Cookies. */
  SESSION_SECRET?: string;
  ENVIRONMENT: 'production' | 'preview' | 'development';
  PUBLIC_ORIGIN: string;
  MAX_DESIGNS_PER_USER: string;
  MAX_DESIGN_BYTES: string;
}
