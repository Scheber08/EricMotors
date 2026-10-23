# Berechnungsmodelle

ScheberMotors rechnet **spielnah, aber plausibel** (angelehnt an _Automation_): einfache,
nachvollziehbare Formeln mit echten Einheiten, kalibriert an realen Serienfahrzeugen. Ziel ist eine
Abweichung von etwa ±20 % zu realen Werten, keine Ingenieursgenauigkeit.

Code: `packages/physics`. Jede Formel steht dort mit Kommentar und Quelle. Die Kalibrierung ist durch
Tests abgesichert (`*.test.ts`), die Referenzmotoren und die Wirkrichtung aller Regler prüfen.

## Konventionen

- **Einheiten:** intern ausschließlich SI (m, kg, s, N, W, Pa, K, rad, rad/s). Umrechnung nur in
  der Oberfläche (`packages/schema/src/units.ts`, Faktoren nach NIST SP 811 und DIN 66036).
- **Regler** im Schema sind 0..1 (Anzeige 0–100 %), **Qualität** ist −5…+5.
- **Ratings** sind 0–100 (höher = besser).

## Konstanten (`constants.ts`)

| Größe                        | Wert                   | Quelle                        |
| ---------------------------- | ---------------------- | ----------------------------- |
| Umgebung                     | 101 325 Pa, 25 °C      | ISO-Normatmosphäre (gerundet) |
| Luft: R, κ                   | 287,05 J/(kg·K), 1,4   | Lehrbuchwerte                 |
| Heizwerte, stöch. AFR        | Benzin 43 MJ/kg, 14,6  | Heywood (1988), Anhang D      |
| Klopfgrenze ROZ 91/95/98/E85 | CR 10,6/11,5/12,3/14,5 | spielnahe Kalibrierung        |

## Motor: Volllastkurve (`engine/curve.ts`)

Mittelwertmodell je Drehzahlpunkt (65 Punkte vom Leerlauf bis zum Begrenzer):

```
IMEP = η_i · λ_L · ρ_Ladung · H_u / (L_st · λ)        Heywood (1988), Gl. 2.41
BMEP = IMEP − FMEP − PMEP
M    = BMEP · V_H / (4π)                                Viertakt
P    = M · ω
```

| Teilmodell               | Ansatz                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liefergrad λ_L           | Glockenkurve in ln(c_m) um die „Atem-Geschwindigkeit“ c_peak = 10 + 7 · Nocke (+ Ventile). Nockenprofil verschiebt und verengt, VVT/VVL verbreitern. Spitzenwert nach Ventiltrieb (0,90–1,03).        |
| Drosselung               | 1 / (1 + 0,12·q_i² + 0,1·q_e²), q = Volumenstrom / Kapazität. Ansaugkapazität relativ zum Hubraum (Regler), Abgaskapazität aus Rohrquerschnitt, Schalldämpfer, Kat. V/Boxer ≥ 6 Zyl.: 2 Stränge.      |
| Innerer Wirkungsgrad η_i | 0,8 · (1 − ε^(1−κ)), κ = 1,3 (Gleichraumprozess, Heywood Gl. 5.31); Faktoren für Zündzeitpunkt, Gemisch (Maximum bei λ ≈ 0,9), Einspritzung, Klopfrücknahme. Diesel: Seiliger-Näherung, Verlust ~ n². |
| Reibung FMEP             | Barnes-Moss (Heywood Gl. 13.20): 0,97 + 0,15·(n/1000) + 0,05·(n/1000)² bar, über c_m auf andere Hübe skaliert, × 0,7 für moderne Motoren; Faktoren Ventiltrieb, Kolben, Diesel × 1,25.                |
| Turbo                    | Ladedruck baut sich zwischen relativer Drehzahl `spoolStart` und `spoolFull` auf (größerer Lader = später); oberhalb der Stopfgrenze fällt der Druck. Gegendruck als PMEP = 0,08 · Ladedruck.         |
| Kompressor               | Roots/Schraube: voller Druck ab 30 % Drehzahl, Radial: ~ n². Antriebsleistung ṁ · c_p · ΔT als zusätzliche Reibung.                                                                                   |
| Ladelufttemperatur       | T₂ = T₁ · (1 + (Π^((κ−1)/κ) − 1)/η_V), Ladeluftkühler mit Effektivität 0,45–0,9 (Heywood Gl. 6.6).                                                                                                    |
| Klopfen                  | Bedarf = ε · Π^0,3 · (T/T₀)^0,8 · Zündfaktor · Gemischfaktor; Grenze aus Kraftstoff (+1 bei Direkteinspritzung). Negative Reserve kostet bis zu 30 % Wirkungsgrad und Zuverlässigkeit.                |
| Teillast (für Verbrauch) | η_e = η_i · BMEP / (BMEP + FMEP + Drosselverlust); Otto × 0,92 (Restgas, Wandwärme), Diesel × 1,08 (Luftüberschuss).                                                                                  |

**Kalibrierung** (Test `curve.test.ts`, Toleranz ±20 %):

| Vorlage          | Modell            | Referenz (real) |
| ---------------- | ----------------- | --------------- |
| 1.6 Sauger       | ≈ 84 kW / 145 Nm  | 88 kW / 155 Nm  |
| 2.0 Sport-Sauger | ≈ 117 kW / 193 Nm | 135 kW / 205 Nm |
| 2.0 Turbo        | ≈ 191 kW / 344 Nm | 180 kW / 350 Nm |
| 5.0 V8           | ≈ 306 kW / 499 Nm | 330 kW / 530 Nm |
| 2.0 Turbodiesel  | ≈ 110 kW / 317 Nm | 110 kW / 340 Nm |

## Motor: Eigenschaften (`engine/properties.ts`)

| Größe          | Ansatz                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Masse          | 25 + 55 · V_Block[l]^0,7 · Werkstofffaktor · (1 + 0,02·(z−4)) · Ventiltrieb; Zuschläge für Lader und Ladeluftkühler, Diesel × 1,12. Kalibriert: Alu-2.0-R4 ≈ 125 kg, Alu-5.0-V8 ≈ 210–230 kg. |
| Abmessungen    | Zylinderabstand 1,18·B + 8 mm; Bankhöhe aus Hub, Pleuel (≈ 1,6·Hub), Kolbenhöhe (≈ 0,35·B) und Zylinderkopf; Breite je nach Bauart und Bankwinkel.                                            |
| Herstellkosten | Summe aus Block (Hubraum, Werkstoff), Kopf je Zylinder, Kurbeltrieb, Nockenverstellung, Aufladung, Gemischaufbereitung, Abgasanlage, Montage; je Abschnitt × (1 + 0,07 · Qualität).           |
| Grenzen        | Zulässige mittlere Kolbengeschwindigkeit (Pleuel/Kolben 19–27 m/s) und zulässiger Mitteldruck (Kurbelwelle/Pleuel/Kolben 15–32 bar).                                                          |

**Ratings:**

| Rating            | Einflüsse                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Laufruhe          | Massenausgleich nach Bauart (R6/V12/Boxer-6 ≈ 95, V8-90° 85, R4 55, R3 50), große Einzelzylinder, scharfe Nocken, Vergaser, Diesel, Qualität. |
| Zuverlässigkeit   | Auslastung von Kolbengeschwindigkeit und Mitteldruck (ab 85 %), Klopfen, Ladedruck, später Zündzeitpunkt, Magnesiumblock, Qualität.           |
| Emissionen        | Katalysator, Gemischaufbereitung, fettes Gemisch (Otto) bzw. niedriges λ (Diesel), Qualität der Abgasanlage.                                  |
| Ansprechverhalten | Nockenprofil, Turbogröße und -anzahl, Ladedruck, Zylindergröße.                                                                               |
| Sparsamkeit       | Teillast-Wirkungsgrad bei 15 kW und 2000/min (≈ 100 km/h): 18 % → 0, 38 % → 100.                                                              |

**Warnungen:** Klopfen, Kolbengeschwindigkeit, Mitteldruck, extremes Hub/Bohrung-Verhältnis
(< 0,6 oder > 1,4), Aufladung ohne Ladeluftkühler, Begrenzer unter dem Leistungsmaximum,
Diesel über 5500/min, Diesel mit Verdichtung < 14.

## Auto

Folgt (Masse und Gewichtsverteilung, cw·A, Reifen, 0–100 km/h, Höchstgeschwindigkeit, Bremsweg,
Querbeschleunigung, Verbrauch, Ratings, Kosten).

## Literatur

- J. B. Heywood: _Internal Combustion Engine Fundamentals_. McGraw-Hill, 1988.
- NIST Special Publication 811: _Guide for the Use of the International System of Units_, 2008.
