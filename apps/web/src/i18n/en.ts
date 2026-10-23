import type { Dictionary } from './index';
import { enEngine } from './en-engine';
import { enCar } from './en-car';
import { enCommunity } from './en-community';
import { mergeDictionaries } from './merge';

const base = {
  app: {
    tagline: 'Design your own cars and engines – from cylinder head to rear wing.',
    nav: { home: 'Home', garage: 'Garage' },
    settings: {
      language: 'Language',
      units: 'Units',
      metric: 'Metric',
      imperial: 'Imperial',
      power: 'Power',
      mode: 'Mode',
      beginner: 'Beginner',
      engineer: 'Engineer',
      theme: 'Theme',
      system: 'System',
      light: 'Light',
      dark: 'Dark',
    },
    localOnly: 'Your designs are stored locally in this browser.',
  },
  home: {
    ctaCar: 'Build a car',
    ctaEngine: 'Build an engine',
    templates: 'Templates',
    templatesHint: 'Start from a template and tweak everything.',
    features: {
      engine: {
        title: 'Engine designer',
        text: 'Block, bottom end, valvetrain, aspiration, exhaust, tune – with a live power curve.',
      },
      car: {
        title: 'Car designer',
        text: 'Shape the body, tune suspension, gearbox, tyres, brakes and aero.',
      },
      stats: {
        title: 'Real numbers',
        text: '0–100 km/h, top speed, fuel economy, cost and ratings.',
      },
    },
  },
  garage: {
    title: 'Garage',
    cars: 'Cars',
    engines: 'Engines',
    empty: 'Nothing built yet.',
    newCar: 'New car',
    newEngine: 'New engine',
    fromTemplate: 'From template',
    open: 'Open',
    duplicate: 'Duplicate',
    delete: 'Delete',
    confirmDelete: 'Really delete “{name}”?',
    updated: 'Updated {date}',
    copyOf: '{name} (copy)',
  },
  templates: {
    car: {
      'light-roadster': 'Light roadster',
      'muscle-car': 'Muscle car',
      'hot-hatch': 'Hot hatch',
      'diesel-wagon': 'Diesel estate',
      'e-compact': 'Electric saloon',
      'e-hypercar': 'Electric hypercar',
      'plugin-hybrid': 'Plug-in hybrid',
    },
    engine: {
      'i4-16-na': '1.6 inline-four',
      'i4-14-turbo': '1.4 turbo',
      'i4-20-na-sport': '2.0 sport NA',
      'i4-20-turbo': '2.0 turbo',
      'v8-50-na': '5.0 V8',
      'i4-20-diesel': '2.0 turbodiesel',
    },
  },
  errors: {
    title: 'Something went wrong.',
    text: 'Your designs are stored locally and are not lost.',
    reload: 'Reload',
  },
  common: {
    undo: 'Undo',
    redo: 'Redo',
    saved: 'Saved',
    saving: 'Saving …',
    loading: 'Loading …',
    notFound: 'Not found.',
    back: 'Back',
    name: 'Name',
    calculating: 'Calculating …',
  },
} satisfies Dictionary;

export const en: Dictionary = mergeDictionaries(base, enEngine, enCar, enCommunity);
