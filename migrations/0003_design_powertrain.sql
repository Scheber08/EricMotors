-- Phase 3: Antriebsart der Autos (ice/electric/hybrid) für Galerie-Filter und Karten.
-- Bisher gespeicherte Autos stammen aus Schema v1 und haben alle einen Verbrenner.

ALTER TABLE designs ADD COLUMN powertrain TEXT;  -- Auto: ice/electric/hybrid; Motor: NULL
UPDATE designs SET powertrain = 'ice' WHERE kind = 'car';
CREATE INDEX idx_designs_gallery_powertrain ON designs (kind, powertrain, visibility, hidden, published_at DESC);
