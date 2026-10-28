import { Link } from 'wouter';
import type { DesignMeta } from '@ericmotors/schema';
import { thumbUrl } from '../api/client';
import { OPTION_ICONS } from '../designer/icons';
import { useLocale, useT } from '../i18n';
import { useSettings } from '../state/settings';
import { formatQuantity } from '../units/format';

/** Karte eines Cloud-Entwurfs für Galerie und Profil. */
export function DesignCard({
  design,
  showOwner = true,
}: {
  design: DesignMeta;
  showOwner?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const units = useSettings((s) => s.units);
  const power = useSettings((s) => s.power);
  const uc = { units, power };
  const s = design.stats;
  const thumb = thumbUrl(design);
  const facts =
    design.kind === 'car'
      ? [
          formatQuantity(s.powerW, 'power', uc, locale),
          formatQuantity(s.massKg, 'mass', uc, locale),
          s.accelS ? `${formatQuantity(s.accelS, 'time', uc, locale)}` : null,
        ]
      : [
          formatQuantity(s.powerW, 'power', uc, locale),
          formatQuantity(s.torqueNm, 'torque', uc, locale),
          formatQuantity(s.massKg, 'mass', uc, locale),
        ];
  return (
    <Link href={`/v/${design.id}`} className="card design-card">
      <div className="design-thumb">
        {design.powertrain && (
          <span className={`powertrain-badge ${design.powertrain}`}>
            {OPTION_ICONS.powertrainType![design.powertrain]}
            {t(`options.params.car.powertrainType.${design.powertrain}`)}
          </span>
        )}
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" width={320} height={180} />
        ) : (
          <span className="muted">{design.kind === 'car' ? '🚗' : '⚙️'}</span>
        )}
      </div>
      <div className="design-body">
        <h3>{design.title}</h3>
        {showOwner && (
          <span className="muted small">{t('gallery.by', { name: design.owner })}</span>
        )}
        <span className="design-facts">{facts.filter(Boolean).join(' · ')}</span>
        <span className="muted small">♥ {design.likes}</span>
      </div>
    </Link>
  );
}
