import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { CAMERA_VIEWS, type CameraView } from './camera';

/** Piktogramme 24 × 24 für die Kamerastandpunkte (Strich, currentColor). */
const ICONS: Record<CameraView | 'turntable', ReactNode> = {
  'three-quarter': (
    <>
      <path d="M3 15l4-5h8l5 3v3H3z" />
      <path d="M7 10l2-3h5l1 3" />
      <circle cx="7" cy="16.5" r="1.8" />
      <circle cx="16.5" cy="16.5" r="1.8" />
    </>
  ),
  front: (
    <>
      <rect x="4" y="9" width="16" height="7" rx="2" />
      <path d="M7 9l1.5-3.5h7L17 9" />
      <path d="M6 12h2.5M15.5 12H18M10 14h4" />
      <path d="M6 16v2M18 16v2" />
    </>
  ),
  side: (
    <>
      <path d="M2 15v-2.5l3-1 3.5-3.5h6.5l3.5 3.5 3.5 1V15z" />
      <circle cx="6.5" cy="15.5" r="2" />
      <circle cx="17.5" cy="15.5" r="2" />
    </>
  ),
  rear: (
    <>
      <rect x="4" y="9" width="16" height="7" rx="2" />
      <path d="M7 9l1.5-3.5h7L17 9" />
      <path d="M5.5 11.5h13" />
      <path d="M10 14h4" />
      <path d="M6 16v2M18 16v2" />
    </>
  ),
  top: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="4" />
      <path d="M9 8v8M16 8.5v7" />
    </>
  ),
  turntable: (
    <>
      <path d="M20 12a8 4 0 1 1-4-3.46" />
      <path d="M16 5.5l.3 3.2-3.2.5" />
      <path d="M9 12l1.5-2h3l1.5 2" />
    </>
  ),
};

const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ICONS[name]}
  </svg>
);

/** Werkzeugleiste über der 3D-Ansicht: Kamerastandpunkte und Drehteller. */
export function ViewerControls({
  camera,
  onCamera,
  autoRotate,
  onAutoRotate,
}: {
  camera: CameraView;
  onCamera: (view: CameraView) => void;
  autoRotate: boolean;
  onAutoRotate: (on: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="viewer-tools" role="toolbar" aria-label={t('designer.camera.label')}>
      {CAMERA_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          className="icon-btn"
          aria-pressed={camera === v}
          title={t(`designer.camera.${v}`)}
          aria-label={t(`designer.camera.${v}`)}
          onClick={() => onCamera(v)}
        >
          <Icon name={v} />
        </button>
      ))}
      <span className="viewer-tools-sep" aria-hidden="true" />
      <button
        type="button"
        className="icon-btn"
        aria-pressed={autoRotate}
        title={t('designer.camera.turntable')}
        aria-label={t('designer.camera.turntable')}
        onClick={() => onAutoRotate(!autoRotate)}
      >
        <Icon name="turntable" />
      </button>
    </div>
  );
}
