import { z } from 'zod';

/** Gemeinsame Typen der Cloud-API (Frontend und Worker). */

export const DesignKind = z.enum(['car', 'engine']);
export type DesignKind = z.infer<typeof DesignKind>;

export const Visibility = z.enum(['private', 'unlisted', 'public']);
export type Visibility = z.infer<typeof Visibility>;

/**
 * Kennzahlen für Galerie-Filter und Karten. Der Client berechnet sie mit `@ericmotors/physics`;
 * der Server prüft nur Plausibilitätsgrenzen (keine Physik auf dem Server). Wahrheit bleibt das Dokument.
 */
export const DesignStats = z.object({
  powerW: z.number().finite().min(0).max(3e6),
  torqueNm: z.number().finite().min(0).max(1e4),
  massKg: z.number().finite().min(20).max(2e4),
  accelS: z.number().finite().min(0.5).max(120).nullable(),
  topSpeedMs: z.number().finite().min(0).max(250).nullable(),
  costEur: z.number().finite().min(0).max(1e8),
});
export type DesignStats = z.infer<typeof DesignStats>;

export const DesignUpload = z.object({
  kind: DesignKind,
  visibility: Visibility,
  /** Auto- bzw. Motordokument; wird serverseitig mit migrateCar/migrateEngine validiert. */
  doc: z.unknown(),
  stats: DesignStats,
});
export type DesignUpload = z.infer<typeof DesignUpload>;

export const ReportReason = z.enum(['offensive', 'spam', 'copyright', 'other']);
export type ReportReason = z.infer<typeof ReportReason>;

export const GallerySort = z.enum(['recent', 'likes']);

export const GalleryQuery = z.object({
  kind: DesignKind.default('car'),
  sort: GallerySort.default('recent'),
  category: z.string().max(24).optional(),
  layout: z.string().max(24).optional(),
  minPowerW: z.coerce.number().min(0).max(3e6).optional(),
  maxMassKg: z.coerce.number().min(0).max(2e4).optional(),
  cursor: z.string().max(80).optional(),
});
export type GalleryQuery = z.infer<typeof GalleryQuery>;

/** Öffentliche Metadaten eines Entwurfs (API-Antwort). */
export interface DesignMeta {
  id: string;
  kind: DesignKind;
  title: string;
  description: string;
  visibility: Visibility;
  owner: string;
  version: number;
  stats: DesignStats;
  category: string | null;
  layout: string | null;
  forkOf: string | null;
  likes: number;
  likedByMe?: boolean;
  /** Version des Vorschaubilds (für unveränderliche Cache-URLs), null ohne Bild. */
  thumbVersion: number | null;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

export interface GalleryPage {
  items: DesignMeta[];
  nextCursor: string | null;
}
