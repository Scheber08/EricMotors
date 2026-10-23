/** Deutsche Texte des Motor-Designers. */
export const deEngine = {
  sections: {
    engine: {
      block: 'Block',
      bottomEnd: 'Kurbeltrieb',
      topEnd: 'Zylinderkopf',
      aspiration: 'Aufladung',
      fuel: 'Gemisch',
      exhaust: 'Abgas',
      tune: 'Abstimmung',
    },
  },
  params: {
    engine: {
      layout: 'Bauart',
      cylinders: 'Zylinder',
      bankAngle: 'Bankwinkel',
      blockMaterial: 'Block-Werkstoff',
      headMaterial: 'Kopf-Werkstoff',
      headType: 'Ventiltrieb',
      valvesPerCylinder: 'Ventile pro Zylinder',
      maxBore: 'Max. Bohrung (Block)',
      maxStroke: 'Max. Hub (Block)',
      quality: 'Qualität',
      bore: 'Bohrung',
      stroke: 'Hub',
      crankshaft: 'Kurbelwelle',
      conrods: 'Pleuel',
      pistons: 'Kolben',
      compressionRatio: 'Verdichtung',
      camProfile: 'Nockenprofil',
      vvt: 'Variable Steuerzeiten (VVT)',
      vvl: 'Variabler Ventilhub (VVL)',
      aspirationKind: 'Aufladung',
      turboCount: 'Anzahl Turbolader',
      turboSize: 'Ladergröße',
      boost: 'Ladedruck',
      intercooler: 'Ladeluftkühler',
      superchargerType: 'Kompressor-Bauart',
      superchargerSize: 'Kompressorgröße',
      fuel: 'Kraftstoff',
      fuelSystem: 'Gemischaufbereitung',
      intakeSize: 'Ansauggröße',
      headers: 'Krümmer',
      exhaustDiameter: 'Abgasrohr-Durchmesser',
      catalyst: 'Katalysator',
      muffler: 'Schalldämpfer',
      lambda: 'Lambda (Volllast)',
      ignitionTiming: 'Zündzeitpunkt',
      revLimit: 'Drehzahlbegrenzer',
    },
  },
  options: {
    material: {
      'cast-iron': 'Grauguss',
      cgi: 'Vermiculargraphit (GJV)',
      aluminium: 'Aluminium',
      'aluminium-sleeved': 'Aluminium mit Laufbuchsen',
      magnesium: 'Magnesium',
    },
    params: {
      engine: {
        layout: { inline: 'Reihe', v: 'V', boxer: 'Boxer' },
        headType: {
          ohv: 'OHV (Stößelstangen)',
          sohc: 'SOHC (eine Nockenwelle)',
          dohc: 'DOHC (zwei Nockenwellen)',
        },
        crankshaft: {
          'cast-iron': 'Gusseisen',
          'forged-steel': 'Stahl geschmiedet',
          'billet-steel': 'Stahl aus dem Vollen',
        },
        conrods: {
          cast: 'Guss',
          'heavy-cast': 'Guss verstärkt',
          forged: 'Geschmiedet',
          titanium: 'Titan',
        },
        pistons: {
          cast: 'Guss',
          hypereutectic: 'Übereutektisch',
          forged: 'Geschmiedet',
          'low-friction': 'Reibungsarm',
        },
        aspirationKind: { natural: 'Saugmotor', turbo: 'Turbolader', supercharger: 'Kompressor' },
        superchargerType: { roots: 'Roots', 'twin-screw': 'Schraube', centrifugal: 'Radial' },
        fuel: {
          regular: 'Normal (ROZ 91)',
          premium: 'Super (ROZ 95)',
          super: 'Super Plus (ROZ 98)',
          e85: 'E85',
          diesel: 'Diesel',
        },
        fuelSystem: {
          carburetor: 'Vergaser',
          'single-point': 'Zentraleinspritzung',
          'multi-point': 'Saugrohreinspritzung',
          direct: 'Direkteinspritzung',
          'diesel-indirect': 'Diesel-Vorkammer',
          'common-rail': 'Common Rail',
        },
        headers: {
          cast: 'Guss',
          'short-tubular': 'Rohr kurz',
          'long-tubular': 'Rohr lang',
          'equal-length': 'Gleich lang',
        },
        catalyst: {
          none: 'Keiner',
          'two-way': 'Oxidationskat',
          'three-way': 'Dreiwegekat',
          'high-flow': 'Sportkat',
        },
        muffler: {
          none: 'Keiner',
          'straight-through': 'Durchgangsdämpfer',
          baffled: 'Kammerdämpfer',
          'reverse-flow': 'Umlenkdämpfer',
        },
      },
    },
  },
  help: {
    params: {
      engine: {
        layout:
          'Anordnung der Zylinder. Reihe ist kompakt und günstig, V kurz und laufruhig ab sechs Zylindern, Boxer flach mit niedrigem Schwerpunkt.',
        cylinders:
          'Mehr Zylinder laufen ruhiger und drehen höher, kosten aber Gewicht, Reibung und Geld.',
        bankAngle:
          'Winkel zwischen den Zylinderbänken. 90° gleicht einen V8 ideal aus, 60° einen V6.',
        blockMaterial:
          'Grauguss ist billig und robust, Aluminium spart viel Gewicht, Magnesium noch mehr – auf Kosten der Haltbarkeit.',
        headMaterial: 'Aluminiumköpfe sind leichter und leiten Wärme besser ab.',
        headType:
          'Obenliegende Nockenwellen erlauben höhere Drehzahlen und bessere Füllung, OHV baut kompakt und günstig.',
        valvesPerCylinder:
          'Mehr Ventile vergrößern den Strömungsquerschnitt: bessere Füllung bei hohen Drehzahlen.',
        maxBore:
          'Größte Bohrung, für die der Block ausgelegt ist. Bestimmt Blockgröße, Gewicht und Kosten.',
        maxStroke: 'Größter Hub, für den der Block ausgelegt ist (Höhe des Blocks).',
        quality: 'Höhere Qualität verbessert Zuverlässigkeit und Wertigkeit, kostet aber mehr.',
        bore: 'Zylinderdurchmesser. Große Bohrung erlaubt große Ventile und hohe Drehzahlen.',
        stroke: 'Kolbenweg. Langer Hub bringt Drehmoment, erhöht aber die Kolbengeschwindigkeit.',
        crankshaft: 'Geschmiedete Kurbelwellen halten höhere Mitteldrücke aus (Aufladung).',
        conrods: 'Bestimmen zusammen mit den Kolben die zulässige Drehzahl und Belastung.',
        pistons:
          'Geschmiedete Kolben halten Aufladung und hohe Drehzahlen aus, reibungsarme sparen Kraftstoff.',
        compressionRatio:
          'Höhere Verdichtung steigert den Wirkungsgrad, erhöht aber die Klopfneigung. Diesel brauchen mindestens 14:1.',
        camProfile:
          'Sanfte Nocken bringen Drehmoment unten, scharfe Nocken Leistung oben – auf Kosten von Laufruhe und Fahrbarkeit.',
        vvt: 'Verstellbare Nockenwellen verbreitern das nutzbare Drehzahlband.',
        vvl: 'Umschaltbarer Ventilhub verbessert die Füllung bei hohen Drehzahlen.',
        turboSize:
          'Kleine Lader sprechen früh an, große liefern mehr Spitzenleistung, aber mit Turboloch.',
        boost:
          'Überdruck im Saugrohr. Mehr Ladedruck bringt mehr Leistung, erhöht aber Klopfneigung und Belastung.',
        intercooler: 'Kühlt die verdichtete Luft: dichtere Ladung, weniger Klopfen.',
        superchargerSize:
          'Größere Kompressoren liefern mehr Luft, brauchen aber mehr Antriebsleistung.',
        fuel: 'Höhere Oktanzahl erlaubt mehr Verdichtung und Ladedruck. E85 ist sehr klopffest, hat aber weniger Energie pro Liter.',
        fuelSystem:
          'Direkteinspritzung kühlt die Ladung und spart Kraftstoff, Vergaser sind billig, aber ungenau.',
        intakeSize: 'Größere Ansaugwege drosseln weniger bei hoher Drehzahl.',
        headers: 'Rohrkrümmer verbessern den Gaswechsel, gleich lange Krümmer am meisten.',
        exhaustDiameter: 'Größere Rohre verringern den Gegendruck, sind aber lauter und schwerer.',
        catalyst: 'Senkt die Emissionen; der Dreiwegekat braucht Lambda ≈ 1.',
        muffler: 'Umlenkdämpfer sind leise, Durchgangsdämpfer lassen das Abgas freier strömen.',
        lambda:
          'Luftverhältnis bei Volllast. Leicht fett (≈ 0,9) bringt beim Benziner Leistung und Kühlung, kostet aber Verbrauch und Emissionen.',
        ignitionTiming:
          'Früher zünden steigert Leistung und Wirkungsgrad, erhöht aber die Klopfgefahr.',
        revLimit: 'Höchstdrehzahl. Zu hoch belastet Pleuel und Kolben (Kolbengeschwindigkeit).',
      },
    },
  },
  formula: {
    params: {
      engine: {
        bore: 'V_H = π/4 · B² · s · z',
        stroke: 'c_m = 2 · s · n',
        compressionRatio: 'η_i ≈ 0,8 · (1 − ε^(1−κ)),  κ = 1,3',
        boost: 'T₂ = T₁ · (1 + (Π^((κ−1)/κ) − 1) / η_V)',
        lambda: 'IMEP = η_i · λ_L · ρ · H_u / (L_st · λ)',
        revLimit: 'FMEP = 0,97 + 0,15·(n/1000) + 0,05·(n/1000)²  [bar]',
        camProfile: 'λ_L(c_m) Glockenkurve um c_peak = 10 + 7 · Nocke',
      },
    },
  },
  stats: {
    engine: {
      power: 'Leistung',
      torque: 'Drehmoment',
      displacement: 'Hubraum',
      mass: 'Motormasse',
      cost: 'Herstellkosten',
      specific: 'Literleistung',
      bsfc: 'Bester spez. Verbrauch',
      dimensions: 'L × B × H',
    },
  },
  charts: {
    torque: 'Drehmoment',
    power: 'Leistung',
    boost: 'Ladedruck',
    efficiency: 'Liefergrad und Wirkungsgrad',
    ve: 'Liefergrad',
    eta: 'Wirkungsgrad',
  },
  ratings: {
    engine: {
      smoothness: 'Laufruhe',
      reliability: 'Zuverlässigkeit',
      emissions: 'Emissionen',
      responsiveness: 'Ansprechverhalten',
      economy: 'Sparsamkeit',
    },
  },
  warnings: {
    engine: {
      knock: {
        text: 'Der Motor klopft.',
        fix: 'Verdichtung oder Ladedruck senken, Zündung später, klopffesteren Kraftstoff oder Direkteinspritzung wählen.',
      },
      pistonSpeed: {
        text: 'Kolbengeschwindigkeit zu hoch.',
        fix: 'Drehzahlbegrenzer senken, Hub verkürzen oder geschmiedete Pleuel/Kolben verbauen.',
      },
      bmep: {
        text: 'Kurbeltrieb überlastet.',
        fix: 'Geschmiedete Kurbelwelle, Pleuel und Kolben verbauen oder Ladedruck senken.',
      },
      boreStroke: {
        text: 'Ungewöhnliches Hub-Bohrungs-Verhältnis.',
        fix: 'Hub/Bohrung zwischen 0,6 und 1,4 halten.',
      },
      noIntercooler: {
        text: 'Aufladung ohne Ladeluftkühler.',
        fix: 'Ladeluftkühler vergrößern – kühlere Luft bringt Leistung und senkt die Klopfneigung.',
      },
      revLimitLow: {
        text: 'Begrenzer liegt unter dem Leistungsmaximum.',
        fix: 'Drehzahlbegrenzer anheben oder Nockenprofil sanfter wählen.',
      },
      dieselRevs: {
        text: 'Diesel dreht zu hoch.',
        fix: 'Drehzahlbegrenzer auf höchstens 5500/min senken.',
      },
      dieselCompression: {
        text: 'Verdichtung reicht für Selbstzündung nicht.',
        fix: 'Verdichtung auf mindestens 14:1 erhöhen.',
      },
    },
  },
  designer: {
    sections: 'Abschnitte',
    variants: 'Varianten',
    addVariant: 'Variante hinzufügen',
    renameVariant: 'Variante umbenennen',
    variantCopy: '{name} 2',
    ratings: 'Bewertung',
    warnings: 'Hinweise',
    noWarnings: 'Keine Probleme gefunden.',
    invalid: 'Ungültig – nicht gespeichert',
    computeTime: 'Berechnet in {ms} ms',
  },
};
