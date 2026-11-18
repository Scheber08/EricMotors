# Deployment auf Cloudflare (Free Plan)

Deployt wird ausschließlich über die Git-Integration von Cloudflare (**Workers Builds**).
GitHub Actions führt nur Prüfungen aus (Lint, Typecheck, Tests, Build).

| Branch              | Befehl (in Workers Builds) | Ergebnis                                                                                                               |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `main`              | `npm run deploy`           | D1-Migrationen auf `ericmotors-prod`, dann Deployment auf <https://car.scheber.com>                                    |
| jeder andere Branch | `npm run deploy:preview`   | D1-Migrationen auf `ericmotors-preview`, dann eigene Preview-URL `https://<branch>-ericmotors.<subdomain>.workers.dev` |

## Einmalige Einrichtung im Cloudflare-Dashboard

### 1. D1-Datenbanken anlegen

1. **Storage & Databases → D1 SQL Database → Create Database**.
2. Name `ericmotors-prod`, Region automatisch. Anlegen.
3. Dasselbe noch einmal mit dem Namen `ericmotors-preview`.
4. Die beiden **Database IDs** (UUIDs) kopieren und eintragen:
   - `wrangler.jsonc` → `d1_databases[0].database_id` (prod)
   - `wrangler.jsonc` → `previews.d1_databases[0].database_id` (preview)
   - `wrangler.preview-migrations.jsonc` → `d1_databases[0].database_id` (preview, dieselbe ID)

   Die IDs sind **keine Secrets** und dürfen im öffentlichen Repo stehen; Zugriff hat nur dein Account.

Alternativ per CLI (nach `npx wrangler login`):

```sh
npx wrangler d1 create ericmotors-prod
npx wrangler d1 create ericmotors-preview
```

### 2. R2-Buckets anlegen

1. **Storage & Databases → R2 Object Storage**. Beim ersten Mal muss R2 aktiviert werden
   (Cloudflare verlangt dafür ggf. eine hinterlegte Zahlungsmethode; der Free-Tier mit 10 GB
   Speicher, 1 Mio. Class-A- und 10 Mio. Class-B-Operationen pro Monat bleibt kostenlos).
2. **Create bucket** → `ericmotors-prod`, Standort automatisch, Storage-Klasse **Standard**
   (der Free-Tier gilt nur für Standard, nicht für Infrequent Access).
3. Dasselbe für `ericmotors-preview`.
4. Keinen Public-Bucket-Zugang aktivieren: Ausgeliefert wird über den Worker.

### 3. Worker mit dem GitHub-Repo verbinden

Der Worker heißt in `wrangler.jsonc` **`ericmotors`**. Der Name im Dashboard muss exakt
übereinstimmen, sonst bricht Workers Builds ab. Heißt dein bereits angelegter Worker anders,
entweder `name` in `wrangler.jsonc` anpassen oder den Worker umbenennen.

1. **Workers & Pages → ericmotors → Settings → Build → Git repository → Connect**.
2. GitHub-Konto autorisieren und `Scheber08/EricMotors` auswählen.
3. Build-Einstellungen:

   | Feld                               | Wert                     |
   | ---------------------------------- | ------------------------ |
   | Production branch                  | `main`                   |
   | Root directory                     | `/` (leer lassen)        |
   | Build command                      | `npm run build`          |
   | Deploy command                     | `npm run deploy`         |
   | Builds for non-production branches | **aktivieren**           |
   | Preview command                    | `npm run deploy:preview` |

   Abhängigkeiten installiert Workers Builds automatisch anhand von `package-lock.json`.
   Die Node-Version kommt aus `.nvmrc` (22).

4. **API-Token prüfen:** Workers Builds legt beim Verbinden ein Build-Token an. Schlägt
   `wrangler d1 migrations apply` mit einem Berechtigungsfehler fehl, das Token unter
   **Settings → Build → API token** bearbeiten und **Account → D1 → Edit** ergänzen.

### 4. Custom Domain

`car.scheber.com` ist in `wrangler.jsonc` als Custom Domain hinterlegt
(`routes: [{ pattern: "car.scheber.com", custom_domain: true }]`). Da die Domain bereits im
Dashboard am Worker hängt, ändert sich nichts. Die Config hält Dashboard und Repo synchron.

### 5. Secret für den Login (Pflicht ab Phase 2)

Der Login (Benutzername + Passwort) signiert Session-Cookies mit `SESSION_SECRET`. Ohne dieses
Secret zeigt die Website keinen Anmelden-Knopf, der Konfigurator funktioniert trotzdem.

1. Einen zufälligen Wert erzeugen, mindestens 32 Zeichen, z. B. mit einem Passwortgenerator oder
   `openssl rand -hex 32`.
2. **Workers & Pages → ericmotors → Settings → Variables and Secrets → Add**: Typ **Secret**,
   Name `SESSION_SECRET`, Wert einfügen, **Deploy**.
3. Für Previews ein **anderes** Secret setzen (getrennte Sessions):
   `npx wrangler preview base-config secret put SESSION_SECRET` (gilt für neue Previews).
4. Prüfen: <https://car.scheber.com/api/health> meldet `"auth": true`.

Ein neues Secret meldet alle Nutzer ab (ihre Cookies werden ungültig), Daten gehen nicht verloren.
Lokal steht das Secret in `.dev.vars` (siehe `.dev.vars.example`, ist in `.gitignore`).

### Passwort eines Nutzers zurücksetzen (Admin)

Es gibt bewusst keine E-Mail und damit kein „Passwort vergessen“. Der Passwort-Hash ist an den
Benutzernamen gebunden (der Browser nutzt ihn als Salz). Deshalb legt der Nutzer sein Konto neu an
und bekommt danach seine Entwürfe übertragen. `name` ist der Benutzername in Kleinbuchstaben;
alle Befehle in **D1 → ericmotors-prod → Console**.

1. Altes Konto umbenennen, damit der Name frei wird:

   ```sql
   UPDATE users SET username = username || '_alt', username_lower = username_lower || '_alt'
     WHERE username_lower = 'name';
   ```

2. Der Nutzer registriert sich unter `name` mit neuem Passwort.
3. Entwürfe übertragen und altes Konto löschen:

   ```sql
   UPDATE designs SET owner_id = (SELECT id FROM users WHERE username_lower = 'name')
     WHERE owner_id = (SELECT id FROM users WHERE username_lower = 'name_alt');
   DELETE FROM likes WHERE user_id = (SELECT id FROM users WHERE username_lower = 'name_alt');
   DELETE FROM reports WHERE reporter_id = (SELECT id FROM users WHERE username_lower = 'name_alt');
   DELETE FROM users WHERE username_lower = 'name_alt';
   UPDATE users SET design_count = (SELECT COUNT(*) FROM designs WHERE owner_id = users.id)
     WHERE username_lower = 'name';
   ```

### 6. Erstes Deployment prüfen

1. Einen Commit auf `main` pushen (oder im Dashboard **Retry build**).
2. Unter **Deployments** den Build-Log verfolgen: Migration `0001_initial.sql` muss ✅ zeigen.
3. <https://car.scheber.com/api/health> muss
   `{"status":"ok","environment":"production","database":"ok"}` liefern.
4. Einen Feature-Branch pushen: Im Pull Request erscheint der Kommentar von Cloudflare mit der
   Preview-URL; deren `/api/health` muss `"environment":"preview"` melden.

## Datenbank-Migrationen

- Neue Migration: `npx wrangler d1 migrations create DB <name>` → Datei in `migrations/`.
- Lokal anwenden: `npm run db:migrate:local`.
- Remote werden Migrationen **nur** im Deploy- bzw. Preview-Befehl angewendet.
- Migrationen sind vorwärtsgerichtet und dürfen nach dem Merge nicht mehr geändert werden.
  Destruktive Änderungen in zwei Schritten ausrollen (erst Code kompatibel machen, dann Spalte entfernen).
- Previews teilen sich die Datenbank `ericmotors-preview`. Eine Migration aus einem Feature-Branch
  landet dort also schon vor dem Merge. Nach verworfenen Branches die Preview-DB bei Bedarf neu anlegen.

## Free-Plan-Überwachung

Dashboard → **Workers & Pages → ericmotors → Metrics** (Requests, CPU-Zeit) und
**D1 → ericmotors-prod → Metrics** (Rows read/written). Richtwerte siehe
[`ARCHITECTURE.md`](ARCHITECTURE.md#3-verbrauchsabschätzung-pro-aktivem-nutzer-und-tag).
