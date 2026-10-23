# EricMotors – Architekturplan

Stand: 2026-10-23. Lebendes Dokument: Änderungen an Architekturentscheidungen werden hier
nachgezogen (Abschnitt „Entscheidungslog“ am Ende).

## 1. Leitplanken

| Prinzip                  | Konsequenz in der Architektur                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spielnah, aber plausibel | Bedienung wie _Automation_: Auswahl + Regler statt Rohparameter. Intern SI-Einheiten und einfache physikalische Formeln, dokumentiert in [`MODELS.md`](MODELS.md).                                                                                                |
| Eine Quelle der Wahrheit | Gespeichert werden **nur Eingabeparameter**. Masse, Schwerpunkt, Leistungskurven usw. berechnet `@ericmotors/physics` deterministisch. Ausnahme: explizite _Overrides_ (z. B. gemessene Masse, cw aus externer CFD) sind selbst Eingaben und als solche markiert. |
| Alles rechnet im Browser | Physik in Web Workern, 3D in WebGL. Der Cloudflare Worker rechnet **nichts** Physikalisches.                                                                                                                                                                      |
| Simulationstauglich      | `Vehicle` → `toSimulationInput()` ist eine reine Funktion. Die spätere Simulation konsumiert nur `SimulationInput`.                                                                                                                                               |
| Free Plan dauerhaft      | Siehe Abschnitt 3: Budget pro aktivem Nutzer, Caching, keine Schreibzugriffe pro Seitenaufruf.                                                                                                                                                                    |

## 2. Free-Plan-Limits (geprüft am 2026-10-23)

Quelle: offizielle Doku (`developers.cloudflare.com`, Quelltext `cloudflare/cloudflare-docs`, Branch
`production`): `workers/platform/limits`, `d1/platform/limits`, `workers/d1-pricing`, `r2/pricing`,
`workers/ci-cd/builds/limits-and-pricing`, `workers/static-assets/billing-and-limitations`, `workers/previews`.

| Ressource                 | Free-Limit                                              | Relevanz                                                     |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Worker-Requests           | 100 000 / Tag (Reset 00:00 UTC)                         | Haupt-Engpass, nur API- und Share-Requests zählen            |
| Static-Asset-Requests     | frei, unbegrenzt                                        | SPA, 3D-Assets, Fonts                                        |
| CPU-Zeit                  | 10 ms / Request                                         | Keine Physik, kein Passwort-Hashing, kleine JSON-Validierung |
| Subrequests (inkl. D1/R2) | 50 / Request                                            | ≤ 5 pro Endpoint angestrebt                                  |
| Speicher                  | 128 MB / Isolate                                        | unkritisch                                                   |
| Worker-Größe              | 64 MiB unkomprimiert                                    | Bundle-Ziel < 200 KB                                         |
| Static Assets             | 20 000 Dateien, je ≤ 25 MiB                             | 3D-Baukasten-Teile müssen in diese Grenze passen             |
| D1 Datenbankgröße         | 500 MB / DB, 5 GB / Account, 10 DBs                     | Nur Metadaten in D1                                          |
| D1 Rows read              | 5 Mio / Tag                                             | Indizes auf allen Filter- und Sortierspalten                 |
| D1 Rows written           | 100 000 / Tag                                           | Kein View-Counter, Likes über Zähler plus Tabelle            |
| D1 Queries / Invocation   | 50                                                      | unkritisch                                                   |
| D1 Zeile / String         | ≤ 2 MB                                                  | Fahrzeugdaten gehören nach R2                                |
| R2 Speicher               | 10 GB-Monat                                             | ~50 KB pro Fahrzeug inkl. Thumbnail                          |
| R2 Class A (Put, List)    | 1 Mio / Monat                                           | Cloud-Speichern nur explizit, nie Autosave in die Cloud      |
| R2 Class B (Get, Head)    | 10 Mio / Monat                                          | durch Cache API abgefedert                                   |
| R2 Egress                 | frei                                                    | –                                                            |
| Rate-Limiting-Binding     | Perioden 10 s oder 60 s, pro Standort approximativ      | Schutz der Schreib-Endpoints                                 |
| Workers Builds            | 3 000 Build-Minuten / Monat, 1 parallel, 20 min Timeout | Build schlank halten (~2 min)                                |
| Previews                  | 100 pro Worker, 100 Deployments pro Preview             | Pro Branch eine Preview-URL                                  |

> Hinweis: Requests, die per `run_worker_first` zwingend den Worker treffen, bekommen nach
> Erreichen des Tageslimits **429** statt Fallback auf Static Assets. Deshalb laufen nur `/api/*`
> und `/v/*` (Share-Seiten mit Open-Graph-Tags) über den Worker.

## 3. Verbrauchsabschätzung pro aktivem Nutzer und Tag

Annahmen für einen „aktiven Nutzer“ (konservativ, eher hoch gegriffen):

| Aktion                              | Anzahl | Worker-Req | D1 read   | D1 write | R2 A  | R2 B  |
| ----------------------------------- | ------ | ---------- | --------- | -------- | ----- | ----- |
| Session prüfen (`/api/me`)          | 2      | 2          | 2         | 0        | 0     | 0     |
| Garage laden                        | 2      | 2          | 2 × 25    | 0        | 0     | 0     |
| Cloud-Speichern (Daten + Thumbnail) | 3      | 3          | 3 × 2     | 3 × 4    | 3 × 2 | 0     |
| Galerie-Seiten (30 % Cache-Miss)    | 10     | 10         | 3 × 30    | 0        | 0     | 0     |
| Fahrzeug ansehen (50 % Cache-Miss)  | 10     | 10         | 5 × 1     | 0        | 0     | 5     |
| Likes                               | 5      | 5          | 5         | 5 × 3    | 0     | 0     |
| **Summe**                           |        | **≈ 32**   | **≈ 160** | **≈ 27** | **6** | **5** |

Daraus die tragbare Zahl täglich aktiver Nutzer (DAU):

| Limit           | Rechnung            | DAU                   |
| --------------- | ------------------- | --------------------- |
| Worker-Requests | 100 000 / 32        | **≈ 3 100** (Engpass) |
| D1 rows written | 100 000 / 27        | ≈ 3 700               |
| D1 rows read    | 5 000 000 / 160     | ≈ 31 000              |
| R2 Class A      | 1 000 000 / 30 / 6  | ≈ 5 500               |
| R2 Class B      | 10 000 000 / 30 / 5 | ≈ 66 000              |

Speicher: ~20 KB gzip-JSON + ~25 KB WebP-Thumbnail pro Fahrzeug → 10 GB R2 ≈ 200 000 Fahrzeuge.
D1: ~1,5 KB pro Fahrzeug inkl. Indizes → 500 MB ≈ 300 000 Fahrzeuge. Limit pro Nutzer: 50 Fahrzeuge
(konfigurierbar per `vars`).

**Graceful Degradation:** Der Konfigurator funktioniert vollständig offline mit IndexedDB.
Antworten 429 / 1027 / 503 aus der API werden in eine verständliche Meldung („Cloud-Funktionen
heute ausgelastet, dein Fahrzeug ist lokal gesichert“) übersetzt.

## 4. Tech-Stack

| Bereich   | Wahl                                                                  | Begründung                                                                                                                  |
| --------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Sprache   | TypeScript (strict)                                                   | gemeinsame Typen Frontend/Worker/Physik                                                                                     |
| Frontend  | React 19 + Vite                                                       | wie vorgeschlagen                                                                                                           |
| 3D        | three.js, React Three Fiber, drei                                     | wie vorgeschlagen; Assets als GLB (Meshopt), KTX2                                                                           |
| State     | **Zustand + zundo** (Undo/Redo)                                       | ~3 KB, ohne Boilerplate; Undo/Redo als Middleware über den Eingabe-Zustand. Redux Toolkit wäre schwerer, ohne Mehrwert hier |
| Schema    | Zod 4                                                                 | ein versioniertes Schema für Frontend und Worker; Migrationen als reine Funktionen                                          |
| Physik    | eigenes Paket, reine Funktionen, Vitest                               | läuft im Web Worker (Comlink-artiger Mini-RPC ohne Abhängigkeit); später WASM möglich                                       |
| Diagramme | uPlot                                                                 | ~45 KB, sehr schnell bei Kennfeldern; Recharts wäre deutlich schwerer                                                       |
| i18n      | eigenes leichtes Wörterbuch (de/en)                                   | keine schwere Bibliothek nötig                                                                                              |
| Backend   | Cloudflare Worker + Hono                                              | Hono ~15 KB, schneller Router                                                                                               |
| Daten     | D1 (Metadaten), R2 (Fahrzeug-JSON gzip, Thumbnails)                   | siehe Limits                                                                                                                |
| Auth      | OAuth GitHub + Google, Session als HMAC-signiertes Cookie (WebCrypto) | kein Passwort-Hashing, CPU-billig                                                                                           |
| Hosting   | **ein** Worker mit Static Assets                                      | SPA statisch, API unter `/api`, Share-Seiten unter `/v/:id`                                                                 |
| Previews  | Cloudflare _Worker Previews_ (`wrangler preview`, `previews`-Block)   | pro Branch eigene URL, eigene Preview-D1 und Preview-R2                                                                     |
| CI        | GitHub Actions: Lint, Typecheck, Test, Build                          | Deployment macht Cloudflare                                                                                                 |

## 5. Repository-Struktur (npm Workspaces)

```
EricMotors/
├─ apps/
│  ├─ web/                  React-SPA (Vite) – Konfigurator, Galerie, Profil
│  │  ├─ src/
│  │  │  ├─ app/            Routing, Layout, Theme, i18n
│  │  │  ├─ configurator/   Modul-Navigation, Parameter-Panels, Kennzahlen
│  │  │  ├─ viewer/         R3F-Szene, Bauteil-Picking, Explosions-/Röntgenansicht
│  │  │  ├─ state/          Zustand-Store (Vehicle-Eingaben), Undo/Redo
│  │  │  ├─ workers/        Web Worker: Physik-Berechnung
│  │  │  ├─ storage/        IndexedDB, Cloud-Sync
│  │  │  └─ i18n/           de.ts, en.ts
│  │  └─ public/            statische Assets (GLB, KTX2, Icons)
│  └─ api/                  Cloudflare Worker (Hono): Auth, Fahrzeuge, Galerie, Likes, Reports
│     └─ src/
├─ packages/
│  ├─ schema/               Zod-Schema `Vehicle` (versioniert), Migrationen, Einheiten
│  ├─ physics/              reine Berechnungsfunktionen (Motor, Getriebe, Masse, …), Vitest
│  └─ sim/                  (später) SimulationInput, Integrator, Fahrdynamik
├─ migrations/              D1-Migrationen (wrangler d1 migrations)
├─ docs/                    ARCHITECTURE.md, MODELS.md, DEPLOYMENT.md
├─ wrangler.jsonc           Worker + Assets + Bindings (prod) + `previews`-Block
├─ wrangler.preview-migrations.jsonc   D1-Migrationen für die Preview-Datenbank
├─ .dev.vars.example        Platzhalter für lokale Secrets (ohne echte Werte)
└─ .github/workflows/ci.yml Lint, Typecheck, Test, Build
```

Lokale Entwicklung: `npm run dev` startet Vite (Port 5173) und `wrangler dev` (Port 8787)
parallel; Vite leitet `/api` und `/v` an Wrangler weiter. Wrangler simuliert D1 und R2 lokal.

## 6. Datenmodell (an _Automation_ angelehnt)

Kurswechsel am 2026-10-23: Bedienung und Rechenlogik orientieren sich an _Automation – The Car
Company Tycoon Game_. Die Formeln bleiben **spielnah, aber plausibel**: einfache, nachvollziehbare
Zusammenhänge mit echten Einheiten, keine Detailmodelle (CFD, FEM, Kinematik, Pacejka).

Es gibt zwei eigenständige Dokumenttypen, beide versioniert und mit Zod validiert:

```
Engine (Motor-Bibliothek)                    Car (Auto)
├─ meta                                      ├─ meta
├─ family   ← Block: Anordnung, Zylinder,    ├─ model      Karosserieform, Abmessungen, Form-Regler
│            Bankwinkel, Block-/Kopf-        ├─ chassis    Bauart, Material, Fahrwerkstypen
│            Material, Ventiltrieb,          ├─ engine     Kopie einer Motorvariante + Herkunft,
│            max. Bohrung/Hub                │             Einbaulage
└─ variants[] ← Bohrung, Hub, Kurbeltrieb,   ├─ trim       Karosseriematerial, Innenraum, Unterhaltung,
               Nockenprofil, VVT/VVL,        │             Sicherheit, Fahrhilfen
               Aufladung, Gemisch, Abgas,    ├─ drivetrain Getriebeart, Gänge, Achsübersetzung, Differenzial
               Abstimmung, Qualität          ├─ suspension Federn, Dämpfer, Stabis (Regler), Höhe, Sturz
                                             ├─ wheels     Felgen, Reifen (Typ, Breite, Querschnitt)
                                             ├─ brakes     Typ, Größe, Kolben, Belag, Verteilung
                                             ├─ aero       Abtrieb vorn/hinten, Unterboden, Kühlluft
                                             └─ paint      Lack, Zonen, Folie, Decals
```

- **Qualitätsregler:** Jeder Abschnitt hat einen Regler von −5 bis +5. Höhere Qualität erhöht
  Zuverlässigkeit und Wertigkeit, kostet mehr und wiegt leicht anders.
- **Motor im Auto:** Das Auto speichert eine _Kopie_ der eingebauten Variante plus Verweis
  `{ engineId, variantId }`. Damit ist jedes Auto eigenständig teilbar und simulierbar. Ändert sich
  der Motor in der Bibliothek, bietet die Oberfläche ein Update an.
- **Abgeleitete Werte** (nie gespeichert): Leistungs-/Drehmomentkurve, Verbrauch, Masse,
  Gewichtsverteilung, cw·A, 0–100 km/h, Höchstgeschwindigkeit, Bremsweg, Querbeschleunigung,
  Kosten und die Ratings.
- **Ratings (0–100):** Motor: Laufruhe, Zuverlässigkeit, Emissionen, Ansprechverhalten.
  Auto: Fahrbarkeit, Sportlichkeit, Komfort, Sicherheit, Praktikabilität, Nutzwert, Offroad,
  Zuverlässigkeit, Prestige.
- **Simulation (später):** `toSimulationInput(car)` erzeugt Masse, Schwerpunkt, Trägheit,
  Drehmomentkurve, Übersetzungen, Reifengrip, Aero-Beiwerte und Bremsmomente als Tabellen.

## 7. Datenbankschema (D1)

```sql
users(id TEXT PK, display_name, avatar_url, created_at, vehicle_count INTEGER DEFAULT 0, banned INTEGER DEFAULT 0)
oauth_accounts(provider, provider_user_id, user_id → users, PK(provider, provider_user_id))
vehicles(
  id TEXT PK, owner_id → users, title, description,
  visibility TEXT CHECK (visibility IN ('private','unlisted','public')),
  drive_type TEXT,           -- 'ice' | 'bev' | 'hybrid' | 'fcev' | …  (denormalisiert für Filter)
  power_w REAL, mass_kg REAL, vehicle_class TEXT,
  tags TEXT,                 -- JSON-Array, Anzeige; Filter über vehicle_tags
  fork_of TEXT,              -- vehicles.id (kann gelöscht sein)
  schema_version INTEGER, data_key TEXT, thumb_key TEXT,
  like_count INTEGER DEFAULT 0, report_count INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0,
  created_at INTEGER, updated_at INTEGER, published_at INTEGER
)
engines(…)                   -- gleiche Struktur wie vehicles, eigene Galerie-Indizes (Migration 0002)
vehicle_tags(vehicle_id, tag, PK(tag, vehicle_id))
likes(user_id, vehicle_id, created_at, PK(user_id, vehicle_id))
reports(id PK, vehicle_id, reporter_id, reason, created_at, UNIQUE(vehicle_id, reporter_id))
```

Indizes: `vehicles(owner_id, updated_at DESC)`, `vehicles(visibility, published_at DESC)`,
`vehicles(visibility, drive_type, published_at DESC)`, `vehicles(visibility, like_count DESC)`.
Galerie-Pagination per **Keyset** (`published_at < ?`), nie `OFFSET`, damit Rows read ≈ Seitengröße.
`power_w`, `mass_kg` usw. berechnet der Client; der Server übernimmt sie nur als Filterhilfe
(Plausibilitätsgrenzen per Zod), die Wahrheit bleibt das Fahrzeug-JSON.

R2-Schlüssel: `vehicles/{id}/v{n}.json.gz`, `thumbs/{id}/{n}.webp`.

## 8. API (Worker)

| Methode     | Pfad                                     | Cache                         | Zweck                                       |
| ----------- | ---------------------------------------- | ----------------------------- | ------------------------------------------- |
| GET         | `/api/health`                            | –                             | Deployment-Check                            |
| GET         | `/api/auth/:provider/login`, `/callback` | –                             | OAuth                                       |
| POST        | `/api/auth/logout`                       | –                             | Session löschen                             |
| GET         | `/api/me`                                | privat                        | Nutzer + Kontingent                         |
| GET         | `/api/vehicles?mine=1`                   | privat                        | Garage                                      |
| PUT         | `/api/vehicles/:id`                      | –                             | Speichern (Zod-Validierung, ≤ 512 KB)       |
| PUT         | `/api/vehicles/:id/thumb`                | –                             | Thumbnail (WebP ≤ 100 KB)                   |
| DELETE      | `/api/vehicles/:id`                      | –                             | Löschen                                     |
| GET         | `/api/vehicles/:id`                      | Cache API 5 min (öffentlich)  | Metadaten                                   |
| GET         | `/api/vehicles/:id/data`                 | immutable (versionierter Key) | Fahrzeug-JSON                               |
| GET         | `/api/gallery?filter…&cursor`            | Cache API 60 s                | Galerie                                     |
| POST/DELETE | `/api/vehicles/:id/like`                 | –                             | Likes                                       |
| POST        | `/api/vehicles/:id/report`               | –                             | Meldung                                     |
| GET         | `/v/:id`                                 | Cache API 5 min               | SPA-HTML mit Open-Graph-Tags (HTMLRewriter) |

Jeder schreibende Endpoint: Rate-Limit-Binding (pro Nutzer), Größenlimit, Origin-Prüfung (CSRF).

## 9. Phasenplan

| Phase                    | Inhalt                                                                                                                                                                                                                                                                                                                                           | Ergebnis                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **0 – Grundgerüst**      | Monorepo, Vite-SPA, Hono-Worker mit `/api/health`, `wrangler.jsonc`, erste D1-Migration, CI, Deploy-Anleitung                                                                                                                                                                                                                                    | „Hello World“ in Produktion und als Preview |
| **1 – MVP**              | Schemas `Engine` und `Car`, IndexedDB-Speicherung, Undo/Redo, Motor-Designer (Verbrenner Otto/Diesel) mit Leistungs-/Drehmomentkurve und Motor-Ratings, Auto-Designer mit parametrischer Karosserie und Lack, Getriebe, Kennzahlen (Masse, 0–100, Vmax, Verbrauch, Kosten) und Auto-Ratings, Plausibilitätswarnungen, Vorlagen, de/en, Dark Mode | Motor und Auto lokal konstruierbar          |
| 2 – Accounts & Community | OAuth, Cloud-Speichern, Galerie für Autos und Motoren, Detailseite, Fork, Likes, Meldungen, OG-Bilder                                                                                                                                                                                                                                            | öffentliche Website                         |
| 3 – Feinschliff Auto     | Anbauteile (Spoiler, Schürzen, Leuchten) an Ankerpunkten, Testfahrt-Kennzahlen, Vergleichsansicht                                                                                                                                                                                                                                                | –                                           |
| 4 – Elektro & Hybrid     | E-Motor, Batterie, Hybrid als zusätzliche Antriebsart im gleichen Bedienschema                                                                                                                                                                                                                                                                   | weitere Antriebe                            |
| 5 – Simulation           | `SimulationInput`, Fahrsimulation im Web Worker, Rundenzeit auf Teststrecken                                                                                                                                                                                                                                                                     | –                                           |

Jede Phase endet mit lauffähigem, getestetem Stand auf `main`.

## 10. Entscheidungslog

| Datum      | Entscheidung                                                                                                                                                                                | Status      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 2026-10-23 | Ein Worker mit Static Assets statt Pages (Cloudflare empfiehlt Workers für neue Full-Stack-Projekte; Previews, D1, R2 und Rate Limiting stehen dort direkt zur Verfügung)                   | beschlossen |
| 2026-10-23 | Zustand + zundo statt Redux Toolkit                                                                                                                                                         | beschlossen |
| 2026-10-23 | uPlot für Diagramme                                                                                                                                                                         | beschlossen |
| 2026-10-23 | Preview-Umgebung über Worker Previews (`previews`-Block) statt Wrangler-Environments                                                                                                        | beschlossen |
| 2026-10-23 | Lizenz AGPL-3.0-only                                                                                                                                                                        | beschlossen |
| 2026-10-23 | Produktions-Domain `car.scheber.com` (Custom Domain am Worker)                                                                                                                              | beschlossen |
| 2026-10-23 | Kurswechsel: Bedienung und Logik an _Automation_ angelehnt, spielnah statt ingenieursnah; Motor-Bibliothek (Familie → Varianten), Qualitätsregler, Kosten, Ratings; zunächst nur Verbrenner | beschlossen |
| 2026-10-23 | Öffentlicher Name **ScheberMotors** (Website, Titel, Open Graph); **EricMotors** bleibt interner Entwicklungsname (Repo, Worker, Pakete)                                                    | beschlossen |
