import type { Dictionary } from './index';
import { deEngine } from './de-engine';

export const de = {
  app: {
    tagline: 'Konstruiere eigene Autos und Motoren – vom Zylinderkopf bis zum Heckflügel.',
    nav: { home: 'Start', garage: 'Garage' },
    settings: {
      language: 'Sprache',
      units: 'Einheiten',
      metric: 'Metrisch',
      imperial: 'Imperial',
      power: 'Leistung',
      mode: 'Modus',
      beginner: 'Einsteiger',
      engineer: 'Ingenieur',
      theme: 'Darstellung',
      system: 'System',
      light: 'Hell',
      dark: 'Dunkel',
    },
    localOnly: 'Deine Entwürfe werden lokal in diesem Browser gespeichert.',
  },
  home: {
    ctaCar: 'Auto bauen',
    ctaEngine: 'Motor bauen',
    templates: 'Vorlagen',
    templatesHint: 'Starte mit einer Vorlage und passe alles an.',
    features: {
      engine: {
        title: 'Motor-Designer',
        text: 'Block, Kurbeltrieb, Ventiltrieb, Aufladung, Abgas, Abstimmung – mit Leistungskurve in Echtzeit.',
      },
      car: {
        title: 'Auto-Designer',
        text: 'Karosserie formen, Fahrwerk, Getriebe, Reifen, Bremsen und Aero abstimmen.',
      },
      stats: {
        title: 'Echte Kennzahlen',
        text: '0–100 km/h, Höchstgeschwindigkeit, Verbrauch, Kosten und Bewertungen.',
      },
    },
  },
  garage: {
    title: 'Garage',
    cars: 'Autos',
    engines: 'Motoren',
    empty: 'Noch nichts gebaut.',
    newCar: 'Neues Auto',
    newEngine: 'Neuer Motor',
    fromTemplate: 'Aus Vorlage',
    open: 'Öffnen',
    duplicate: 'Duplizieren',
    delete: 'Löschen',
    confirmDelete: '„{name}“ wirklich löschen?',
    updated: 'Geändert {date}',
    copyOf: '{name} (Kopie)',
  },
  templates: {
    car: {
      'light-roadster': 'Leichter Roadster',
      'muscle-car': 'Muscle Car',
      'hot-hatch': 'Turbo-Kompakter',
      'diesel-wagon': 'Diesel-Kombi',
    },
    engine: {
      'i4-16-na': '1.6 Reihenvierer',
      'i4-20-na-sport': '2.0 Sport-Sauger',
      'i4-20-turbo': '2.0 Turbo',
      'v8-50-na': '5.0 V8',
      'i4-20-diesel': '2.0 Turbodiesel',
    },
  },
  ...deEngine,
  errors: {
    title: 'Hier ist etwas schiefgelaufen.',
    text: 'Deine Entwürfe sind lokal gespeichert und gehen nicht verloren.',
    reload: 'Neu laden',
  },
  common: {
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    saved: 'Gespeichert',
    saving: 'Speichert …',
    loading: 'Lädt …',
    notFound: 'Nicht gefunden.',
    back: 'Zurück',
    name: 'Name',
    calculating: 'Berechnet …',
  },
} satisfies Dictionary;
