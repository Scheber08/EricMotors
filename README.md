# ScheberMotors

> Interner Entwicklungsname: **EricMotors** (Repository, Worker, Pakete). Öffentlich heißt die Website **ScheberMotors**.

Ingenieursnaher Fahrzeug-Konfigurator im Browser: Karosserie, Antrieb, Antriebsstrang,
Fahrwerk, Bremsen, Reifen, Aerodynamik – definiert über reale physikalische Parameter.
Fahrzeuge lassen sich speichern, veröffentlichen, teilen und als Vorlage übernehmen.
Eine physikalische Simulation folgt in einer späteren Phase.

Live: <https://car.scheber.com>

> Status: Phase 1 (MVP). Architektur und Phasenplan: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
> Berechnungsmodelle und Quellen: [`docs/MODELS.md`](docs/MODELS.md).

## Funktionen (Phase 1)

Bedienung und Rechenlogik sind an _Automation – The Car Company Tycoon Game_ angelehnt:
spielnah, aber mit plausiblen Formeln und echten Einheiten.

- **Motor-Designer:** Block (Bauart, Zylinder, Werkstoffe, Ventiltrieb), Kurbeltrieb, Zylinderkopf,
  Aufladung (Turbo, Kompressor), Gemischaufbereitung, Abgasanlage, Abstimmung; mehrere Varianten
  je Motorfamilie. Live: Drehmoment-, Leistungs- und Ladedruckkurve, Masse, Kosten, Ratings
  (Laufruhe, Zuverlässigkeit, Emissionen, Ansprechverhalten, Sparsamkeit) und Warnungen mit
  Lösungsvorschlag.
- **Auto-Designer:** parametrische 3D-Karosserie (8 Grundformen, Form-Regler), Lack (Uni, Metallic,
  Perleffekt, Matt, Chrom, Mehrfarbig, Folie), Chassis, Motor aus der eigenen Bibliothek, Ausstattung,
  Antrieb und Getriebe, Fahrwerk, Räder, Bremsen, Aerodynamik. Live: 0–100 km/h,
  Höchstgeschwindigkeit, Bremsweg, Querbeschleunigung, Verbrauch, CO₂, Kosten, Zugkraftdiagramm,
  9 Ratings und Kompatibilitätsprüfungen. Röntgen- und Explosionsansicht, anklickbare Bauteile.
- Einsteiger- und Ingenieur-Modus, Undo/Redo, metrisch/imperial, kW/PS/hp, Deutsch/Englisch,
  Dark Mode, lokale Garage (IndexedDB) ohne Konto.

## Aufbau

| Pfad               | Inhalt                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `apps/web`         | React-SPA (Vite): Konfigurator, 3D-Ansicht, Galerie                          |
| `apps/api`         | Cloudflare Worker (Hono): Auth, Speichern/Laden, Galerie, Likes              |
| `packages/schema`  | Versioniertes Fahrzeugschema (Zod), Einheiten – gemeinsam für Web und Worker |
| `packages/physics` | Reine, getestete Berechnungsfunktionen (ab Phase 1)                          |
| `migrations`       | D1-Migrationen                                                               |

Alle physikalischen Berechnungen und das 3D-Rendering laufen im Browser. Der Worker speichert
und liefert nur Daten aus, damit alles im kostenlosen Cloudflare-Plan bleibt.

## Lokale Entwicklung

Voraussetzung: Node.js 22 (siehe `.nvmrc`).

```sh
npm install
cp .dev.vars.example .dev.vars   # lokale Secrets, wird nicht committet
npm run db:migrate:local         # lokale D1-Datenbank anlegen
npm run dev                      # Vite (http://localhost:5173) + Worker (Port 8787)
```

Vite leitet `/api` und `/v` an den lokalen Worker weiter. D1 und R2 werden von Wrangler lokal
simuliert, ein Cloudflare-Konto ist für die Entwicklung nicht nötig.

Weitere Befehle:

| Befehl                               | Zweck                                                |
| ------------------------------------ | ---------------------------------------------------- |
| `npm test`                           | Unit-Tests (Vitest)                                  |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                                  |
| `npm run format`                     | Prettier                                             |
| `npm run build`                      | Produktions-Build des Frontends nach `apps/web/dist` |

## Deployment

`main` ist Produktion. Entwickelt wird in Feature-Branches mit Pull Requests
(Conventional Commits). Cloudflare Workers Builds deployt jeden Push auf `main` nach
<https://car.scheber.com> und erzeugt für jeden anderen Branch eine Preview-URL mit eigener
Datenbank. GitHub Actions prüft jeden Pull Request (Lint, Typecheck, Tests, Build).

Einmalige Einrichtung und Details: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

**Keine Secrets committen.** Secrets nur über `wrangler secret put` bzw. das Dashboard,
lokal über `.dev.vars`.

## Lizenz

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
Wer EricMotors verändert und als öffentlichen Dienst betreibt, muss den geänderten Quellcode
den Nutzern dieses Dienstes zugänglich machen.
