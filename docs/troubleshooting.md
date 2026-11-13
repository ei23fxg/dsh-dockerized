# Troubleshooting dsh-dockerized

## Bild & Volumes

- **Wann baut der Wrapper neu?** Nur wenn das Image fehlt oder sein Label
  `dsh-dockerized.build.stamp` nicht zum aktuellen Stamp passt
  (`DSHD_VERSION`/`DSHD_RUST_VERSION` geändert). Ein Rebuild verliert nichts:
  Profile, Plugins und Sessions liegen in `~/.dsh`, Caches im Volume
  `dsh-dockerized-cache`.
- **Rebuild trotz unveränderter Konfiguration?** Jemand hat das Image oder den
  Build-Cache gelöscht: ungefiltertes `docker image prune -a`,
  `docker system prune -a` oder `docker volume prune`. Beheben: einmal
  `dsh rebuild`; künftig nur gezielt prunen — Image und Volume tragen das
  Label `dsh-dockerized.managed=true`.
- **`/bin/sh: 0: cannot open /usr/local/bin/dsh-entrypoint: Permission denied`:**
  Das Image wurde aus einem Build-Kontext mit restriktiven Dateirechten gebaut
  (Entrypoint ohne Lesebits, z. B. Modus 711). Behoben ab Build-Stamp `2-…`
  (Dockerfile setzt jetzt explizit `chmod 755`/`a+rX`): Wrapper aktualisieren,
  der nächste Start baut wegen Stamp-Wechsel automatisch neu (oder manuell
  `dsh rebuild`).
- **Erststart braucht Netz:** Das Web-Profil wird beim allerersten Boot
  automatisch initialisiert (`dsh plugin add` holt Abhängigkeiten), und der
  npm-Registry-Zugriff passiert während des Image-Baus.

## Web-UI

- **URL lädt nicht:** Du bist nicht auf dem Docker-Host — Host-Network gilt nur
  dort. Von anderswo tunneln:
  `ssh -N -L 3080:127.0.0.1:3080 user@dockerhost`.
- **`EADDRINUSE` / Port belegt:** Ein anderer Kontext läuft schon auf 3080.
  `DSHD_PORT=3081 dsh -m web` (der Wrapper reicht `--port` nur durch, wenn du
  nicht selbst einen angibst).
- **WEB_PROVIDER_AMBIGUOUS:** Dein `cordis.patch.yml`-`web`-Eintrag muss
  `fetchProvider` mitsetzen (siehe Vorlage) — ein Patch ersetzt die ganze
  Config der Zeile.
- **Token ungültig nach Neustart:** Beim Boot entsteht immer ein frischer
  Prozess-Token; die neu gedruckte `dsh web:`-URL öffnen.

## Sessions & Isolation

- **Historie wirkt leer:** Sessions hängen am Workspace-Pfad
  (`~/.dsh/sessions/--<encodierter Pfad>--`). Festes Home und jedes `-m`-Projekt
  sind getrennte Kontexte; der Projektordnername im Container enthält einen
  Hash des Host-Pfads — derselbe Projektordner am selben Platz = derselbe Key.
  Projekt verschoben/umbenannt → neuer Key, alte Sessions bleiben unter dem
  alten Namen erhalten.
- **Datei sieht der Agent nicht:** Sie steckt in der Versteck-Liste
  (`.env`, `.dsh`, Ignore-Dateien …). Einmalig zeigen: `dsh --show-hidden -m`.
- **`.env` versehentlich gemountet:** Bei selektiven Datei-Mounts
  (`dsh -m FILE…`) gelten die Versteck-Regeln nicht — mounte bewusst nur,
  was offen sein soll.

## Read-only-Projekt-Mount (`-ro`)

- **Was:** `dsh -ro -m` (ganzes Projekt), `dsh -ro -m FILE…` (jede Datei einzeln),
  `DSHD_READ_ONLY=1` als Env — der Workspace-Bind bekommt `:ro`, erzwungen von
  Docker, nicht per Prompt.
- **Bewusst weiter beschreibbar:** `~/dsh-home`, `~/.dsh`, Session-Mounts und
  `mounts.conf`-Ziele — sonst könnten Sessions nicht gespeichert werden.
- **Git-Auto-Init** wird bei `-ro` übersprungen (das Repo würde ins ro-Projekt
  gelegt). Bestehende `.git`-Ordner im Projekt bleiben natürlich sichtbar.
- **`-ro` ohne `-m`** ist wirkungslos: Warnung, keine Env-Var im Container.
- **Abgrenzung `mounts.conf`:** Das Projekt selbst kann dort nicht auf `:ro`
  gestellt werden (`DSHD_WORK_DIR` ist reserviertes Mount-Ziel); dafür ist `-ro`
  der vorgesehene Weg. `:ro` in `mounts.conf` bleibt für Zusatz-Verzeichnisse.
- **Bestands-`~/.dsh`:** Der Seed wird nie überschrieben — der
  Prompt-Hinweis („keine Workarounds, Änderungen als Diff“) fehlt in alten
  `cordis.patch.yml`; bei Bedarf aus `examples/dsh/cordis.patch.yml` übernehmen.
- **Offener Host-Test:** verschachtelte Versteck-Mounts (Empty-Dir//dev/null)
  unter einem ro-Elternbind — erwartet funktionierend, auf dem ersten echten
  Docker-Host gegenprüfen.

## Berechtigungen

- Der Container läuft mit deiner Host-UID/GID. Root-Eigentum in `~/.dsh`
  (z. B. von alten Compose-Läufen mit anderem User) reparieren:
  `sudo chown -R $(whoami):$(id -gn) ~/.dsh ~/dsh-home`
- Cap-Mounts in `mounts.conf` relativ, mit fehlendem Host-Pfad oder über
  reservierten Zielen (`/home/hostuser/.dsh/...`, `/opt/dsh-plugins`,
  Workspace-Pfad) werden mit Warnung ignoriert.

## Profil/Plugins

- **`dsh-entrypoint: initialisiere Profil …`**: beim ersten Boot eines Profils
  registriert es das SearXNG-Plugin (`dsh plugin add`) — einmalig, braucht Netz.
- **Plugin-Manual:** `dsh plugin --profile web <pnpm-args>` läuft im Container
  gegen dein `~/.dsh/profiles/web` (persistent). Ein `dsh rebuild` danach ist
  nicht nötig.
- **Eigenes DSH ohne dieses Repo bauen:** `dsh-plugins/searxng/` und
  `docker/dsh-entrypoint.sh` weglassen; der Entrypoint erkennt das fehlende
  Plugin und startet unverändert.

## Alte Compose-Variante (Root-Setup) ersetzen

Der Wrapper nutzt `~/.dsh` direkt — Profile/Sessions des bisherigen Setups
(`-v /home/user/.dsh/:/root/.dsh/`) werden einfach weiterverwendet. Der
Containerpfad ändert sich von `/root/.dsh` nach `/home/hostuser/.dsh`;
Sessions-Ordnung folgt dem **Workspace**-Pfad, nicht dem Home — deine bisherigen
Workspace-Sessions bleiben sichtbar, solange du dieselben Host-Projekte per
`-m` mountest (der Encodierungs-Key stammt vom Container-Workspace-Pfad, der
sich durch den Wechsel ändert — alte Keys bleiben als Ordner erhalten).
