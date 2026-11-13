# Globale Anweisungen (dsh-dockerized)

<!--
DSH hängt diese Datei als Anweisungen an jede Session an ("Instructions from:
~/.dsh/AGENTS.md"). Halte sie kurz, konkret und geheimfrei. Diese Datei wird
nur angelegt, wenn sie noch nicht existiert.
-->

Du arbeitest in einem Docker-Container (dsh-dockerized). Der Host ist nicht
sichtbar; erreichbar sind nur dieser Workspace und die explizit eingetragenen
Mounts (siehe ~/.dsh/mounts.conf).

- Node.js: `pnpm`, Python: `uv`, Rust: `cargo` — alles vorinstalliert.
- Mit `git` sind lokale Commits möglich (GIT_*-Identität wird gesetzt);
  `push` ist ohne Credentials nicht eingerichtet.

## Arbeitsweise (Working loop)

- Lege vor nicht-trivialen Aufgaben ein `TODO.md` im Projekt-Root an
  (`- [ ]` offen, `- [~]` läuft, `- [x]` fertig; erledigte Einträge behalten).
- Quality Gate: vor jedem `- [x]` das passende Prüfkommando ausführen
  (`tsc --noEmit`, `bash -n`, `shellcheck`, `cargo check`, `pytest`, …);
  erst bei Exit-Code 0 abhaken, sonst fixen und erneut prüfen.
- Nach jedem grünen Schritt ein Git-Checkpoint:
  `git add -A && git commit -m "checkpoint: …"`.
