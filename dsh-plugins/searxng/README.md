# dsh-web-search-searxng

Ein Suchprovider für den DeepSeek Harness (DSH), der die native Websuche
(`web_search`) gegen eine selbst gehostete **SearXNG**-Instanz laufen lässt –
ohne API-Key, ohne Vendor-Endpoint. `web_fetch` bleibt unverändert.

Das Plugin registriert sich in der Web-Capability `ctx.web` unter der
Provider-Id `searxng`. Das Modell sieht weiterhin nur `web_search`, die
Anfrage geht aber an deine Instanz (Standard hier: `http://10.1.1.11:4002`).

## Warum Plugin statt Skill

Ein Skill wäre nur eine Anleitung, damit das Modell per `bash`/`curl` sucht:
kostet Kontext, einen zusätzlichen Tool-Call, und die Ergebnisse laufen an der
normalen Zitat- und Quellenlogik von `web_search` vorbei. Das Plugin sitzt an
derselben Stelle wie der eingebaute DeepSeek-Provider.

## Betrieb in Docker (empfohlen)

**Wichtig:** `/root/.dsh` und der Workspace sind in der Praxis Bind-Mounts.
Alles, was nur im Workspace liegt, verschwindet beim nächsten Host-Wechsel;
alles, was beim Build nur in `/root/.dsh` liegt, wird vom Volume verdeckt.
Deshalb:

1. Plugin-Code ins Image kopieren (`/opt/dsh-plugins/searxng`),
2. beim Containerstart die Verlinkung im Profil sicherstellen
   (`docker/dsh-entrypoint.sh`),
3. `SEARXNG_BASE_URL` als `ENV` setzen.

Siehe [docker/Dockerfile.example](docker/Dockerfile.example). Die relevanten
Zeilen für eine bestehende Dockerfile:

```dockerfile
COPY searxng-plugin /opt/dsh-plugins/searxng
COPY searxng-plugin/docker/dsh-entrypoint.sh /usr/local/bin/dsh-entrypoint
RUN chmod +x /usr/local/bin/dsh-entrypoint

ENV SEARXNG_BASE_URL=http://10.1.1.11:4002

# Nur nötig, wenn /root/.dsh NICHT gemountet wird:
RUN dsh plugin --profile web add /opt/dsh-plugins/searxng

ENTRYPOINT ["/usr/local/bin/dsh-entrypoint"]
```

Der Ordner `searxng-plugin/` muss dafür neben der Dockerfile im
Build-Context liegen (`docker build -t dsh .`).

Das Bundle bringt seine eigene Patch-Zeile mit und pinnt dabei
`searchProvider: searxng` sowie `fetchProvider: http`. Ein Profil-Patch ist
für die Funktion also **nicht** nötig; `baseURL` kommt aus
`SEARXNG_BASE_URL`.

Der Entrypoint ist idempotent und repariert auch Altlasten: er schreibt die
Abhängigkeit auf `link:/opt/dsh-plugins/searxng`, ergänzt das Bundle und
ersetzt einen Symlink, der noch auf einen alten Workspace-Pfad zeigt. Ohne
gemountetes `/root/.dsh` greift bereits das beim Build erzeugte Profil.

## Installation ohne Docker

```sh
dsh plugin --profile web add /pfad/zu/searxng-plugin
```

und dann in `$DSH_HOME/profiles/web/cordis.patch.yml` (nur nötig, wenn die
Instanz nicht über `SEARXNG_BASE_URL` gesetzt ist):

```yaml
- id: web-search-searxng
  config:
    baseURL: "http://10.1.1.11:4002"
```

## Konfiguration

Alle Schlüssel sind optional; sie liegen auf der Zeile `web-search-searxng`.

| Schlüssel | Default | Bedeutung |
|---|---|---|
| `baseURL` | `$SEARXNG_BASE_URL` | Wurzel der Instanz, z. B. `http://10.1.1.11:4002`. Muss `format=json` liefern; Sub-Pfade wie `https://host/searxng` sind erlaubt. Ohne Wert ist der Provider „unavailable“. |
| `language` | – | SearXNG-`language`, z. B. `de`, `de-DE`, `en-US`. |
| `engines` | – | Kommagetrennte Engine-Allowlist, z. B. `duckduckgo,brave`. |
| `categories` | – | Kommagetrennter Kategoriefilter, z. B. `general,news,it`. |
| `timeRange` | – | Aktualität: `day`, `week`, `month`, `year`. |
| `safeSearch` | – | `0` aus, `1` moderat, `2` streng. |
| `authHeader` | – | `Authorization`-Header im Klartext, falls ein API-Gate vor der Instanz steht. |
| `timeoutMs` | `15000` | Zeitlimit pro Anfrage; das Tool-Layer hat zusätzlich `searchTimeoutMs` (60 s). |

Die Ergebniszahl begrenzt weiterhin `dsh-tool-web` (`searchMaxResults`,
Default 8); die Seam kürzt entsprechend.

## Auswahl bei mehreren Providern

Das Bundle pinnt `searxng` bereits auf der `web`-Zeile. Ein späterer
Profil-Patch kann das überschreiben (Patch-Reihenfolge: Bundles → Profil →
Home). Ohne Pin und mit zwei verfügbaren Providern meldet die Seam
`WEB_PROVIDER_AMBIGUOUS`.

## Fehlerbilder

- **HTTP 403** – JSON-Format nicht freigeschaltet: in `settings.yml`
  `search.formats: [html, json]` ergänzen und Instanz neu starten.
- **HTTP 429** – Rate-Limiter; für eine private Instanz `limiter: false`.
- **„did not answer within 15000 ms“** – Instanz nicht erreichbar/langsam.
- **`WEB_PROVIDER_CONFIGURED_MISSING`** – Provider-Zeile fehlt, obwohl
  `searchProvider: searxng` gesetzt ist (Bundle nicht geladen).
- **`WEB_PROVIDER_CONFIGURED_UNAVAILABLE`** – `baseURL` fehlt/ungültig.
- **`WEB_PROVIDER_AMBIGUOUS`** – mehrere Provider verfügbar, keiner gewählt.

## Deinstallation

```sh
dsh plugin --profile web remove dsh-web-search-searxng
```

Im Docker-Betrieb zusätzlich die `COPY`-/`RUN`-Zeilen und den Entrypoint aus
der Dockerfile entfernen.

## Tests

```sh
cd searxng-plugin && npm test
```

Die Tests starten eine lokale Mock-Instanz und prüfen Mapping, Dedupe,
Parameter, 403/429-Meldungen, Timeout und Abbruch. Der Test-Resolver
(`test/resolver.mjs`) bildet nur die DSH-Installationsauflösung für
`@deepseek-ai/*` nach; im Betrieb übernimmt das der DSH-Loader.
