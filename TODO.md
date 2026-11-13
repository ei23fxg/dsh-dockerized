# TODO — dsh-dockerized

Umsetzung wie pi-mono-dockerized: ein Wrapper mit eingebettetem Dockerfile,
Konfiguration im Host-`~/.dsh`, Kontext-getrennte Sessions, Web-UI als
Standardstart. Prüfungen auf diesem Host (kein Docker): `bash -n`,
shellcheck 0.11.0 (0 Meldungen), Fake-Docker-Szenarien, Encoder-Vergleich
gegen `projectKey` aus `dsh-session-persistence-jsonl`.

---

### Phase 1: Grundgerüst

- [x] **1.1. Wrapper-Skript `dsh`** mit eingebettetem Dockerfile (Toolchain +
      DSH ins Image, rustup, uv, SearXNG-Plugin `COPY dsh-plugins/searxng`),
      Build-Stamp `1-$DSHD_VERSION-$DSHD_RUST_VERSION`, Labels
      `dsh-dockerized.managed=true`.
- [x] **1.2. SearXNG-Plugin kopiert** (aus `/opt/dsh-plugins/searxng` des
      laufenden Images) nach `dsh-plugins/searxng/`, inkl. `lib/`, Patch,
      Tests; `docker/dsh-entrypoint.sh` generalisiert (Profil über
      `DSH_FIX_PROFILE`, idempotent, ohne Plugin-Ordner No-op).
- [x] **1.3. Beispiel-Konfiguration** `examples/dsh/`: Home-Patch
      `cordis.patch.yml` (SearXNG, Telemetrie-off, Strata-Provider,
      Modell-Default), `AGENTS.md` (Container-Hinweise + Working loop),
      `mounts.conf`. Seeds werden nur angelegt, nie überschrieben.

### Phase 2: Modi & Isolation

- [x] **2.1. Session-Key-Berechnung** (`dsh_session_key`) exakt wie DSHs
      `projectKey`: Separator-Läufe → `-`, führende `-` ab, Wrap `--…--`,
      Kürzung 251. Verifiziert gegen die Originalimplementierung (node) —
      9/9 MATCH. Container-Pfade werden ASCII-saniert, damit der Key
      deterministisch bleibt.
- [x] **2.2. Kontexte**: festes Home `~/dsh-home` (verwalteter
      mounts.conf-Eintrag) / volles `-m`-Projekt / selektive Datei-Mounts
      `-m FILE…`; Projektmodus maskiert den Sessions-Root (tmp-Eltern-Verzeichnis
      + einziger Projektordner) — Sessions anderer Projekte unsichtbar.
- [x] **2.3. Versteckte Projektdateien** via `/dev/null`-/Empty-Dir-Mounts
      (`.env`, `.dsh`, Ignore-Dateien …), `--show-hidden` als Schalter,
      `.git` sichtbar (Default) mit `DSHD_ALLOW_GIT=0`.
- [x] **2.4. Git-Auto-Init** (`git init` + Snapshot-Commit) nur beim vollen
      Projekt-Mount; GIT_*-Identität immer durchgereicht.
- [x] **2.5. Web-Standardstart**: `web`-Profil mit `--no-open`, `--port`
      (DSHD_PORT=3080) nur wenn nicht selbst gesetzt, `--trusted-host
      localhost/127.0.0.1`; Host-Network, URL+Token erscheint im Terminal.
      `headless` und Custom-Profile gehen als Passthrough; `plugin`/Launcher-
      Flags im Raw-Modus ohne Workspace-Mount.

### Phase 3: Tests auf diesem Host (kein echtes Docker)

- [x] **3.1. `bash -n`** für `dsh` und `docker/dsh-entrypoint.sh`.
- [x] **3.2. shellcheck 0.11.0**: 0 Meldungen (SC2329 per Disable-Kommentar
      für den trap-Aufruf).
- [x] **3.3. Fake-Docker-Szenarien** (14 Assertions): Home-Start, `-m`,
      `-m FILE`, `headless`, `plugin` (raw), `web --port 3081` (kein Doppel-Port),
      `--help` (raw), rebuild/Stamp, Sanierung `Prüfung Projekt v2` →
      `Pr_fung_Projekt_v2_<hash>`, Session-Key-Mount, Auto-Init nur voll.
- [x] **3.4. Gerendertes Dockerfile** geprüft (DSH+pnpm-ARGs, Plugin-COPY,
      kein ENTRYPOINT/CMD — Wrapper komponiert den Startbefehl).

### Phase 4: Überprüfung am Docker-Host (Handarbeit)

- [ ] **4.1. Erststart**: `alias dsh="bash /pfad/zu/dsh-dockerized/dsh"`,
      dann `dsh` — Image-Bau, Seed nach `~/.dsh` (nur wenn fehlende Dateien!),
      URL+Token aus der `dsh web:`-Zeile im Browser öffnen, chatten.
- [ ] **4.2. Projektmodus**: in einem Repo `dsh -m` — Web-UI zeigt Workspace,
      `TODO.md`-Experiment, `git log` mit „checkpoint: initial workspace
      snapshot“, andere Projektsessions nicht sichtbar.
- [ ] **4.3. headless**: `dsh -m headless "fasse README.md zusammen"` druckt
      die Antwort und beendet sich.
- [ ] **4.4. Bestandssetup**: vorhandenes `~/.dsh` (alter Compose-Lauf) wird
      übernommen — SearXNG-Registrierung repariert der Entrypoint,
      `cordis.patch.yml` bleibt unverändert.
- [ ] **4.5. Update-Pfad**: `DSHD_VERSION=… dsh rebuild`, danach Profile/
      Plugins/Sessions unverändert; `dsh plugin --profile web add <pkg>`
      persistent.
