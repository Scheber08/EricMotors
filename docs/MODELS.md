# Physikalische Modelle

Jedes Berechnungsmodell in `packages/physics` wird hier mit Gleichungen, Annahmen,
Gültigkeitsbereich, Unsicherheit und Literaturquelle dokumentiert. Der Code verweist mit
Kommentar auf die Quelle und auf den Abschnitt in diesem Dokument.

## Konventionen

- **Einheiten:** intern ausschließlich SI (m, kg, s, N, W, Pa, K, rad, rad/s). Umrechnung nur
  in der Oberfläche (`packages/schema/src/units.ts`; Faktoren nach NIST SP 811 und DIN 66036).
- **Koordinatensystem:** ISO 8855 – Ursprung Mitte Vorderachse auf Fahrbahnhöhe, x nach vorn,
  y nach links, z nach oben.
- **Unsicherheit:** Näherungsmodelle geben neben dem Wert einen Gültigkeitsbereich und eine
  geschätzte relative Unsicherheit zurück, die die Oberfläche anzeigt.

## Modelle

Folgen ab Phase 1 (0D-Motormodell, Getriebe/Zugkraft, Massenbilanz).
