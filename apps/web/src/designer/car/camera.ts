/** Kamerastandpunkte der 3D-Ansicht (ohne three.js, damit die Bedienleiste nicht den 3D-Chunk lädt). */
export type CameraView = 'three-quarter' | 'front' | 'side' | 'rear' | 'top';
export const CAMERA_VIEWS: readonly CameraView[] = [
  'three-quarter',
  'front',
  'side',
  'rear',
  'top',
];
