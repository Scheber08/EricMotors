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

## Auto: Masse (`car/mass.ts`)

Jede Baugruppe bekommt Masse und Schwerpunktlage (x, z). Bezugsgröße für Karosserie, Glas,
Elektrik und Kleinteile ist das Hüllvolumen V = L · B · H.

| Baugruppe                                                                      | Ansatz                                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Rohkarosserie                                                                  | 25 kg/m³ · V · Bauart (Monocoque 1, Leiterrahmen 1,4, Gitterrohr 0,8) · Werkstoff (Alu 0,65, CFK 0,45) |
| Außenhaut                                                                      | 11 kg/m³ · V · Form · Werkstoff (Alu 0,6, GFK 0,7, CFK 0,45)                                           |
| Motor                                                                          | aus der Motoranalyse; Lage nach Einbauposition                                                         |
| Getriebe/Antrieb                                                               | Bauart, Gangzahl, Allrad +55 kg, Kardanwelle, Sperre                                                   |
| Räder                                                                          | Felge ~ (D/17″)^1,5 · Breite · Werkstoff, Reifen ~ Breite · (Außendurchmesser)^1,5                     |
| Bremsen, Fahrwerk                                                              | Tabellenwerte je Bauart, Scheibe ~ D²                                                                  |
| Innenraum, Ausstattung, Kraftstoff (90 %), Abgas, Kühlung, Elektrik, Sonstiges | Tabellen- bzw. Volumenansätze                                                                          |

Schwerpunkt und Achslastverteilung folgen aus Σ m·x / Σ m. Kalibrierung: Roadster ≈ 1100 kg,
Kompakt ≈ 1350 kg, Muscle Car ≈ 1620 kg, Kombi ≈ 1480 kg (Test ±15 %).

## Auto: Aerodynamik und Reifen

- c_w: Grundwert je Karosserieform (Coupé 0,30 … Pickup 0,42, typische Serienwerte nach
  Hucho 2013) plus Zuschläge für Scheibenneigung, Heckform, Nase, Radläufe, Unterboden, Kühlluft,
  Flügel, Bodenfreiheit, Reifenbreite und Felgendesign (Aero −0,006, Gitter +0,003,
  Vielspeiche +0,002). Beim Elektroauto zählt die Kühlluftöffnung nur halb.
- Stirnfläche A ≈ 0,84 · B · H (Hucho 2013). Auftrieb je Achse aus Grundwert, Flügeln und Unterboden.
- Reifen: Haftbeiwert je Mischung (Öko 0,85 … Slick 1,35) · (Breite/225 mm)^0,1, Rollwiderstand
  je Mischung (0,0075 … 0,016), dynamischer Radius = 0,97 · statischer Radius.

## Auto: Fahrleistungen (`car/performance.ts`)

```
F_Rad = M_Motor · i_G · i_A · η / r
F_W   = ½ · ρ · c_w · A · v² + f_R · (1 + V/160 km/h) · (m · g + F_Abtrieb)   Wong (2008), Gl. 1.1
δ     = 1,04 + 0,0015 · (i_G · i_A)²                                          Form nach Wong (2008), Kap. 3.2
```

| Größe                  | Verfahren                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Höchstgeschwindigkeit  | größtes v je Gang mit F_Rad ≥ F_W; Begrenzung durch Luftwiderstand oder Drehzahlbegrenzer                                                                                                                                                             |
| 0–100, 80–120, ¼ Meile | Zeitschritt 5 ms; Anfahren mit schleifender Kupplung bzw. Wandler (Momentüberhöhung bis 1,9); Traktionsgrenze μ · Achslast mit dynamischer Achslastverlagerung m·a·h/L; Schaltpausen je Getriebe; traktionsbegrenzt nur Räder beschleunigt (δ = 1,04) |
| Bremsweg 100–0         | ∫ v dv / a(v), a = min(Reibung · Wirkungsgrad, Bremskapazität / m); ABS, Abweichung der Bremskraftverteilung vom Optimum, Längs-μ = 1,08 · Quer-μ                                                                                                     |
| Querbeschleunigung     | μ · (m·g + Abtrieb)/m bei 80 km/h · Faktoren für Lastempfindlichkeit, Fahrwerk, Sturz (Optimum −1,5°), Schwerpunkthöhe/Spur, Eigenlenkbalance                                                                                                         |
| Verbrauch              | Mischzyklus 35 % Stadt (50 km/h, 1,2 Stopps/km, 15 % Standzeit), 40 % Land (90 km/h), 25 % Autobahn (120 km/h); höchster sinnvoller Gang; Teillast-Wirkungsgrad des Motors; Zuschlag 1,1                                                              |

Kalibrierung (Test ±15 % Masse/Vmax, ±35 % Beschleunigung, ±25 % Verbrauch): Roadster
7,7 s / 228 km/h / 6,3 l, Muscle Car 5,9 s / 284 km/h / 10,2 l, Turbo-Kompakter 6,3 s / 253 km/h /
7,7 l, Diesel-Kombi 10,0 s / 208 km/h / 5,6 l, Elektro-Limousine 3,9 s / 244 km/h / 19,0 kWh /
413 km, Elektro-Hypercar 2,5 s / 403 km/h / 26,7 kWh, Plug-in-Hybrid 7,4 s / 263 km/h / 1,0 l +
15,7 kWh / 67 km elektrisch. Für E-Autos dienen Praxiswerte (ADAC Ecotest) als Referenz, weil der
Mischzyklus schneller als der WLTP ist.

### Antriebseinheiten (`car/drive.ts`)

Jede Vortriebsquelle ist eine Einheit mit Achse, Übersetzungen und Momentenkennlinie:

- **Verbrenner** über das Schaltgetriebe; Achse nach Antriebsart, bei Allrad über das
  Mitteldifferenzial verteilt (`awdFrontShare`). Ein E-Motor am Getriebe (Parallelhybrid „P2“)
  addiert sein Moment an der Getriebeeingangswelle.
- **E-Motoren an Vorder-/Hinterachse** mit fester Untersetzung (Wirkungsgrad 0,97), Drehmassen-
  koeffizient 0,0008 statt 0,0015.

Pro Achse gilt die Traktionsgrenze μ · Achslast · Ausnutzung. Ausnutzung nach Differenzial
(offen 0,86, Visko 0,90, Lamellen 0,93, Torsen 0,92, aktiv 0,96; je ein Motor pro Rad 0,97),
Traktionskontrolle holt 40 %, Launch Control 70 % des Rests. Überschuss einer durchdrehenden Achse
wird beim Getriebe-Allrad je nach Mitteldifferenzial weitergeleitet (offen 0 … aktiv 1). Die
elektrische Leistung aller Einheiten ist durch die Batterie begrenzt; der elektrische Kraftanteil
wird dann anteilig gekürzt.

### E-Motor und Batterie (`electric/`)

| Größe           | Modell                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Motorkennlinie  | konstantes Moment bis zur Eckdrehzahl (PMSM 0,33, Asynchron 0,30, Axialfluss 0,40 · n_max), darüber P = konst. |
| Wirkungsgrad    | Spitze (PMSM 0,96, ASM 0,935, Axialfluss 0,965) − Teillast- und Drehzahlabschlag, · Inverter 0,975             |
| Dauerleistung   | Anteil der Spitze nach Kühlung (Luft 0,45, Wasser 0,6, Ölsprüh 0,75)                                           |
| Masse, Kosten   | kW/kg und €/kW je Bauart, plus Inverter und Untersetzung                                                       |
| Batterie        | Energiedichte und €/kWh je Chemie (LFP, NMC, NCA, Festkörper) × Zellauslegung (Energie/ausgewogen/Leistung)    |
| Entladeleistung | kWh · C-Rate (Chemie × Zellauslegung × Kühlung); kleine Hybridbatterien erhalten einen Hochleistungsbonus      |
| Laden 10→80 %   | 0,7 · E / (0,75 · P_Lade), P_Lade = min(C-Rate · E, 150 kW bei 400 V bzw. 300 kW bei 800 V)                    |

### Verbrauch und Reichweite (`car/consumption.ts`)

- **Elektro:** gleicher Mischzyklus; Energie Batterie → Rad über den besten Motor, Rekuperation
  gewinnt 65 % der Bremsenergie (× Wirkungsgrad hin und zurück), Nebenverbraucher 450 W +
  Unterhaltung; Zuschlag 1,03; Ladeverluste 1,1. Reichweite = 0,95 · E / Verbrauch.
- **Hybrid:** Verbrenner-Zyklus ohne Leerlauf (Start-Stopp), Ersparnis h = min(1, P_E / 30 kW):
  Stadt −40 % · h, Land −12 % · h, Autobahn −5 % · h.
- **Plug-in:** elektrische Reichweite mit 90 % der Kapazität; Nutzfaktor UF = 1 − exp(−R / 40 km)
  gewichtet Strom und Kraftstoff (Näherung der WLTP-Kurve).
- Stromkosten 0,40 €/kWh. CO₂ nur am Auspuff.

### Chassis und Bremsen (`car/chassis.ts`, `car/brakes.ts`)

- **Torsionssteifigkeit** = Grundwert (Monocoque 25, Gitterrohr 18, Leiterrahmen 8 kN·m/°) ×
  Werkstoff × Karosserieform (Roadster 0,55 …) × 2,7 m / Radstand × Qualität. Wirkt auf
  Querbeschleunigung, Komfort, Sicherheit und Sportlichkeit.
- **Bremsfading:** Anzahl Vollbremsungen aus 100 km/h, bis die Scheiben die Fading-Temperatur
  erreichen (Wärmekapazität der Scheiben, Kühlanteil je Bauart).

## Auto: Kosten, Ratings, Warnungen (`car/cost.ts`, `car/ratings.ts`)

- **Herstellkosten:** Motor + Karosserie (Volumen^0,7 · Werkstoff · Lackart) + Antriebsstrang +
  Fahrwerk + Räder + Bremsen + Ausstattung + Aero + Montage; je Abschnitt × (1 + 0,07 · Qualität).
- **Unterhalt pro Jahr (15 000 km):** Kraftstoff + Wartung (2,5 % der Herstellkosten, mehr bei
  geringer Zuverlässigkeit) + Reifenverschleiß.
- **Ratings** (gewichtete Summe normierter Teilgrößen):

| Rating          | wichtigste Einflüsse                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Fahrbarkeit     | Drehmomentverlauf, Getriebeart, Fahrhilfen, Servolenkung, Ansprechverhalten, Balance               |
| Sportlichkeit   | 0–100, Querbeschleunigung, Bremsweg, Leistungsgewicht, Masse                                       |
| Komfort         | Federhärte, Dämpfung, Feder-/Dämpferart, Innenraum, Unterhaltung, Laufruhe, Geräusch, Reifenflanke |
| Sicherheit      | Sicherheitsausstattung, Fahrhilfen, Bremsweg, Masse, Chassisbauart                                 |
| Praktikabilität | Sitze, Laderaum, Energiekosten je 100 km, Reichweite, Ladezeit                                     |
| Nutzwert        | Drehmoment, Heck-/Allradantrieb, Leiterrahmen, Karosserieform                                      |
| Offroad         | Bodenfreiheit, Allrad, Reifen, Starrachsen, Überhänge, Sperre                                      |
| Zuverlässigkeit | Motor bzw. Batteriehaltbarkeit, Getriebeart, Qualität, aufwendige Federung                         |
| Prestige        | Innenraum, Unterhaltung, Werkstoffe, Zylinder- bzw. Motorzahl, Leistung, Qualität, Lack            |
| Umwelt          | CO₂, Schadstoffe des Motors, Energiebedarf, Masse                                                  |

- **Warnungen:** Motor passt nicht (Länge, Breite, Höhe je Einbaulage), Getriebe überlastet,
  erster Gang zu lang, Höchstgeschwindigkeit durch Drehzahl begrenzt, zu viel Leistung für
  Frontantrieb/ohne Traktionskontrolle, Bremsen zu schwach, Überhitzung, Bremsscheibe passt nicht
  in die Felge, Reifen zu breit, extreme Gewichtsverteilung, starkes Unter-/Übersteuern; dazu
  Batterie begrenzt Motorleistung, kurze Reichweite, Plug-in mit kleiner Batterie, passive Kühlung
  bei hoher Leistung, langsames Laden, Antriebsart passt nicht zu den Motoren, Vmax durch
  Motordrehzahl begrenzt, Bremsfading, weiche Karosserie.

## Simulation (vorbereitet)

`toSimulationInput(car)` liefert flache Daten für eine spätere Fahrsimulation: Masse, Schwerpunkt,
Gierträgheit, Antriebseinheiten (Achse, abgetastete Momentkurve inkl. E-Anteil, Übersetzungen),
Batteriegrenze und -energie, Reifen, Aero-Flächen, Bremskraft, Fahrhilfen.

## Testfahrt (`testdrive/vehicle.ts`, `testdrive/track.ts`)

Echtzeit-Fahrmodell zum Selberfahren, abgeleitet aus der Analyse (keine eigenen Fahrzeugdaten):

- **Zugkraft:** Hüllkurve aus den Zugkraftkurven (bester Gang je Antriebseinheit, Summe), begrenzt
  durch die Systemleistung P/v (Batteriegrenze). Haftgrenze beim Antreiben μ · g · Anteil der
  angetriebenen Achslast inkl. Lastverlagerung (Allrad 1). Hochschalten unterbricht die Zugkraft
  0,15 s, Zurückschalten mit Hysterese.
- **Widerstand und Bremsen:** Fahrwiderstandskurve der Analyse; Bremsverzögerung aus dem Bremsweg
  100–0 (a = v² / 2s). Bremse im Stand legt den Rückwärtsgang ein (3 m/s², max. 8 m/s).
- **Querdynamik:** Einspurmodell im Fahrzeugsystem mit Kammschem Kreis

  ```
  du/dt = a_x + w · r
  dw/dt = a_y,Reifen − u · r,   a_y,Reifen = clamp(u · r − w / 0,08 s, ±√(a_max² − a_x²))
  r_soll = u · tan δ / (L · (1 + K · u²)),   K = 0,0012 + 0,006 · max(0, Balance)
  ```

  a_max ist die berechnete Querbeschleunigung. Im Grenzbereich wird r_soll auf a_y/u begrenzt und
  mit (1 − 2,5 · Balance) gewichtet: Untersteuerer schieben, Übersteuerer drehen ein. Handbremse:
  45 % Seitenführung, Heck kommt (Faktor 1,6). Lenkeinschlag 0,6 rad / (1 + v / 14 m/s).

- **Strecke:** geschlossener Catmull-Rom-Spline (≈ 2,3 km, 12 m breit), Randsteine in Kurven;
  daneben Wiese mit 55 % Haftung und 0,07 g Zusatzwiderstand. Runden zählen nur in Fahrtrichtung
  und nach Erreichen der Streckenhälfte.

Abgleich (Tests): 0–100 im Fahrmodell innerhalb −25 %/+20 % der Analyse, Vmax und Bremsweg
innerhalb weniger Prozent; ein einfacher Autopilot fährt mit Hypercar und Kombi je eine Runde ohne Ausritt.

## Literatur

- J. B. Heywood: _Internal Combustion Engine Fundamentals_. McGraw-Hill, 1988.
- W.-H. Hucho (Hrsg.): _Aerodynamik des Automobils_. 6. Aufl., Springer Vieweg, 2013.
- J. Y. Wong: _Theory of Ground Vehicles_. 4. Aufl., Wiley, 2008.
- NIST Special Publication 811: _Guide for the Use of the International System of Units_, 2008.
