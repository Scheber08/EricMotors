/** Bindings und Variablen aus `wrangler.jsonc` (Produktion und `previews`-Block). */
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  WRITE_LIMITER: RateLimit;
  ENVIRONMENT: 'production' | 'preview' | 'development';
  PUBLIC_ORIGIN: string;
  MAX_VEHICLES_PER_USER: string;
  MAX_VEHICLE_BYTES: string;
}
