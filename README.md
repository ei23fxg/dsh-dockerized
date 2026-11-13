# DSH Dockerized

Betreibt [DeepSeek Harness (`dsh`)](https://www.npmjs.com/package/@deepseek-ai/dsh) in einem isolierten
Docker-Container — Konzept analog zu [pi-mono-dockerized](../pi-mono-dockerized/): die komplette
Toolchain (Node, Rust, Go, Python, PHP, Build-Tools) steckt im Image; Einstellungen, Patches,
Sessions und Anhänge bleiben im Host-`~/.dsh`. Ein Befehl startet: `dsh`.

> **Hinweis:** Bash-Skript, **nur Linux**. Der erste Start baut das Image — ein paar Minuten Geduld.

## Quick start

```bash
alias dsh="bash /path/to/dsh-dockerized/dsh"   # in ~/.bashrc eintragen
dsh              # Web-UI im festen Arbeits-Home (~/dsh-home); URL+Token erscheint im Terminal
dsh -m           # aktuelles Verzeichnis als Workspace mounten, dann Web-UI
dsh -m headless "fix the tests"   # Einmal-Auftrag im Terminal, Antwort wird gedruckt
```

`dsh` ohne Argumente startet das **Web-Profil** mit `--no-open`; es druckt eine Zeile `dsh web:`
mit tokenisierter URL (z. B. `http://127.0.0.1:3080/#<token>`) — im Browser auf dem Docker-Host
öffnen. Ein interaktives TUI-Profil liefert DSH derzeit nicht; für Terminalarbeit nutze
`headless` (Einmal-Task) oder `dsh plugin ...`/Launcher-Flags.

## Arbeitsmodi

| Befehl | Wirkung |
|---|---|
| `dsh` | Festes Arbeits-Home `~/dsh-home`, Web-UI auf Port 3080 |
| `dsh -m` | Mountet das aktuelle Verzeichnis als Workspace (Web-UI) |
| `dsh -m README.md "MY FILE.md"` | Mountt nur diese Dateien; der Rest bleibt auf dem Host |
| `dsh headless "prompt"` | Einmal-Task im festen Home (druckt das Ergebnis, beendet sich) |
| `dsh -m headless "prompt"` | Einmal-Task im aktuellen Projekt |
| `dsh web --port 3081` | Web-Profil mit eigenen Flags (eigener Port, `--host`, TLS …) |
| `dsh <name> …` | Eigenes/Custom-Profil booten (z. B. `rescue`) |
| `dsh plugin --profile web add <pkg>` | Plugin-Verwaltung (pnpm im Profil, persistent in `~/.dsh`) |
| `dsh --help` / `dsh --version` | Launcher-Hilfe/-Version direkt aus dem Container |
| `dsh --show-hidden -m` | Einmalig alle standardmäßig versteckten Projektdateien zeigen |
| `dsh rebuild` | Image neu bauen (`DSHD_VERSION=0.2.3 dsh rebuild` pinnt eine Version) |

- `-m`, `--show-hidden` und `rebuild` sind Wrapper-Flags; alles andere geht unverändert an `dsh` im
  Container. Nach `-m` bedeutet ein nacktes `web` immer Web-Start, nie ein Pfad — ein Ordner namens
  `web` wird mit `./web` gemountet.
- Jede Session gehört zum Kontext (festes Home bzw. je Projekt eigener Sitzungsordner); du siehst
  nie Sessions anderer Projekte — DSH speichert Sessions nach Workspace-Pfad
  (`~/.dsh/sessions/--<encodierter Pfad>--`), der Wrapper isoliert das per Session-Root-Mount.

## Web-UI

DSH bindet loopback im Container; der Wrapper fährt immer **Host-Network**, deshalb funktioniert die
gedruckte URL direkt auf dem Docker-Host — kein `-p`/`ports:` nötig. Von einem anderen Rechner:
Tunneln, z. B. `ssh -N -L 3080:127.0.0.1:3080 user@dockerhost`. Der Token in der URL ist die
Authentifizierung; die Web-UI ist nicht für das offene Internet gedacht. Zwei Web-Sessions
gleichzeitig brauchen verschiedene Ports (`DSHD_PORT=3081 dsh -m web`).

## Privacy & Isolation — so funktioniert die Trennung

- Ein Container pro Kontext, ephemär (`--rm`), als deine Host-UID/GID — erzeugte Dateien gehören dir.
- Sichtbar sind nur: Host-`~/.dsh` (Konfiguration/Sessions), der gemountete Workspace, das
  Arbeits-Home und was du in `~/.dsh/mounts.conf` einträgst — nie der ganze Host.
- Ein volles `-m`-Projekt verbirgt `.env`, `.secret`, `.deploy`, `.build`, `.vscode`, diverse
  Ignore-Dateien und ein projekt-lokales `.dsh/` (per `/dev/null`-/Leerverzeichnis-Mounts).
  `.git`, `.gitignore`, `.gitmodules` sind sichtbar — `DSHD_ALLOW_GIT=0` verbirgt sie auch.
- Telemetrie aus: `DSH_TELEMETRY_*`-Flags plus deaktivierte OTel-/Analytics-Rows in
  `~/.dsh/cordis.patch.yml` (siehe `examples/dsh/cordis.patch.yml`).

## Konfiguration

Wird einmal angelegt, bestehende Dateien werden **nie** überschrieben (Vorlagen in
[`examples/dsh/`](examples/dsh/)):

```
~/.dsh/cordis.patch.yml   # Home-Patch-Ebene: SearXNG, Telemetrie-off, Modell-Provider, SystemPrompt
~/.dsh/AGENTS.md          # globale Anweisungen (DSH hängt sie an jede Session)
~/.dsh/mounts.conf        # feste Zusatz-Mounts + verwalteter Eintrag für ~/dsh-home
~/.dsh/<API_KEY>          # Schlüsseldateien, z. B. ~/.dsh/STRATA_API_KEY (chmod 600)
```

Die Patch-Ebenen von DSH: Bundles → Profil-Patch → **Home-Patch** (`~/.dsh/cordis.patch.yml`) →
`--patch`-Overlays. Der Home-Patch gilt für alle Profile — genau der Ort für Provider,
Datenschutz-Disables und Modell-Defaults.

**API-Keys:** Dateien `~/.dsh/DEEPSEEK_API_KEY`, `STRATA_API_KEY`, `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `HF_TOKEN`, `GH_TOKEN`,
`GITHUB_TOKEN` — oder bereits gesetzte Host-Umgebungsvariablen werden durchgereicht.
Weitere Namen (z. B. `DB_HOST`/`DB_USER` wie im alten Compose-Setup) über `DSHD_EXTRA_ENV`.

**SearXNG-Suche:** Das Plugin `dsh-web-search-searxng` liegt fest im Image
(`/opt/dsh-plugins/searxng`); bei jedem Start repariert `dsh-entrypoint` idempotent die
Registrierung im gebooteten Profil. Ziel-Instanz im Home-Patch (`baseURL`) setzen.

### Zusatz-Mounts

Dauerhafte Extramounts in `~/.dsh/mounts.conf` (ein Mount pro Zeile):

```text
# <host-pfad>:<container-pfad>[:ro|:rw]
~/shared:/shared:ro
/opt/resolve/bin/ResolveMCP:/opt/resolve/bin/ResolveMCP
```

### Wrapper-Variablen

Shell-Umgebungsvariablen **auf dem Host** (nicht in DSH-Konfiguration):

```bash
DSHD_PORT=3081 dsh web     # nur dieser Start
export DSHD_ALLOW_GIT=0    # alle künftigen Starts
```

| Variable | Standard | Zweck |
|---|---|---|
| `DSHD_ALLOW_GIT` | `1` | `0` verbirgt `.git`, `.gitignore`, `.gitmodules` |
| `DSHD_GIT_AUTOINIT` | `1` | `0` überspringt `git init` + Snapshot-Commit für Projekte ohne Repo |
| `DSHD_SHOW_HIDDEN` | `0` | `1` zeigt alle versteckten Projektdateien |
| `DSHD_GIT_NAME` / `DSHD_GIT_EMAIL` | Host-Werte | Commit-Identität im Container |
| `DSHD_HOME_DIR` | `~/dsh-home` | Host-Quellordner des festen Arbeits-Homes |
| `DSHD_MOUNT_CWD` | `0` | `1` verhält sich immer wie `dsh -m` |
| `DSHD_MOUNTS_FILE` | `~/.dsh/mounts.conf` | Ort der Zusatz-Mounts |
| `DSHD_PORT` | `3080` | Port der Web-UI |
| `DSHD_OPEN_BROWSER` | `0` | `1` unterdrückt `--no-open` (bringt im Container wenig) |
| `DSHD_EXTRA_ENV` | `DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME` | durchgereichte Host-ENV-Namen |
| `DSHD_VERSION` | `latest` | DSH-Version im Image (Änderung ⇒ Rebuild) |
| `DSHD_RUST_VERSION` | `stable` | Rust-Toolchain im Image (Änderung ⇒ Rebuild) |

## Image & Updates

DSH wird **ins Image** gebaut (`npm install -g @deepseek-ai/dsh@<DSHD_VERSION>`).
Update: `dsh rebuild` (holt `@latest`) oder reproduktiv: `DSHD_VERSION=0.2.3 dsh rebuild`.
Das Image baut sich automatisch neu, wenn sich der Build-Stamp ändert
(`DSHD_VERSION`/`DSHD_RUST_VERSION`). Profile und Plugins bleiben bei einem Rebuild erhalten —
sie liegen in `~/.dsh`. Image und Volume sind mit `dsh-dockerized.managed=true` gelabelt; vermeide
ungefiltertes `docker image prune -a` / `docker system prune -a`.

## Git

Der Agent nutzt normales `git` im Container. Lokale Commits klappen mit deiner Host-Identität
(`git config --global user.name/user.email` oder `DSHD_GIT_NAME`/`DSHD_GIT_EMAIL`); ohne Host-Werte
gilt der Fallback `DSH Agent <agent@dsh-dockerized.local>`. Ein `-m`-Projekt **ohne** Repo bekommt
beim Start `git init` plus `initial workspace snapshot`-Commit — jede Agent-Phase hat damit eine
diffbare Basis (`DSHD_GIT_AUTOINIT=0` zum Abschalten). **Push ist nicht eingerichtet** (keine
SSH-Keys/Credentials im Container); wer es will, legt Credentials bewusst via `mounts.conf` frei.

## Umgang mit dem Host-`~/.dsh`

Der Wrapper legt nichts in deinem Home an außer `~/dsh-home`. Wenn du DSH vorher direkt auf dem
Host betrieben hast, bleiben alle bestehenden Dateien (`cordis.patch.yml`, Profile, Sessions)
unangetastet und werden weiterverwendet — der Container schreibt in dieselbe Struktur.

## Troubleshooting

- **Erster Start langsam?** Normal — Image-Build. Ein späterer Rebuild heißt: Build-Cache/Label
  geändert oder Image weggepruned. Details: [docs/troubleshooting.md](docs/troubleshooting.md).
- **Port belegt?** Zwei Web-Kontexte parallel → `DSHD_PORT` unterscheiden.
- **Session-Historie leer?** Du bootest in einem anderen Kontext (festes Home vs. `-m`-Projekt);
  Sessions sind pro Workspace getrennt.
- `Warning: dsh-entrypoint: …` beim ersten Start = frisches Profil initialisiert wird (Netz nötig).

More: [docs/troubleshooting.md](docs/troubleshooting.md).

## Disclaimer

**Benutzung auf eigenes Risiko.** Wie bei pi-mono-dockerized: API-Keys, Mounts und Credentials
sind deine Verantwortung; KI-generierten Code vor der Nutzung prüfen. Inoffizieller Wrapper, keine
Affiliation mit DeepSeek/dsh.
