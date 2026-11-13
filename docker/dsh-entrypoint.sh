#!/bin/sh
# Stellt beim Start sicher, dass das ins Image gebackene SearXNG-Plugin im
# gebooteten DSH-Profil registriert ist, und führt dann das eigentliche
# Kommando aus (EXIT-Code wird durchgereicht).
#
# Hintergrund: ~/.dsh ist ein Bind-Mount vom Host. Inhalt, der beim Image-Build
# dort erzeugt wurde, wird davon verdeckt; außerdem kann ein altes Profil auf
# einen Workspace-Pfad zeigen, der nicht mehr existiert. Dieses Skript ist
# idempotent: es schreibt die Abhängigkeit auf den stabilen Image-Pfad, ergänzt
# das Bundle und repariert den Symlink — ohne Netzwerk, außer bei einem ganz
# frischen Profil (dann erledigt das `dsh plugin add`).
#
# Der dsh-Wrapper setzt DSH_FIX_PROFILE auf das gebootete Profil (z. B. "web");
# mit "none" oder leer wird nichts repariert und direkt ausgeführt.
set -eu

DSH_HOME_DIR="${DSH_HOME:-/home/hostuser/.dsh}"
PROFILE="${DSH_FIX_PROFILE:-web}"
PLUGIN_DIR="${SEARXNG_PLUGIN_DIR:-/opt/dsh-plugins/searxng}"
DEP="dsh-web-search-searxng"

# Kein Plugin im Image (Beispiel: eigene Dockerfile ohne diese Zeilen) oder
# Reparatur abgeschaltet -> Kommando direkt ausführen.
if [ ! -d "$PLUGIN_DIR" ] || [ -z "$PROFILE" ] || [ "$PROFILE" = "none" ]; then
  exec "$@"
fi

PROFILE_DIR="$DSH_HOME_DIR/profiles/$PROFILE"
LINK="$PROFILE_DIR/node_modules/$DEP"

# Frisches/leeres Profil: DSH legt Manifest und Bundle-Liste selbst an.
if [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "dsh-entrypoint: initialisiere Profil '$PROFILE' mit SearXNG-Plugin" >&2
  dsh plugin --profile "$PROFILE" add "$PLUGIN_DIR" >&2 || true
fi

if [ -f "$PROFILE_DIR/package.json" ]; then
  node - "$PROFILE_DIR/package.json" "$DEP" "link:$PLUGIN_DIR" <<'NODE' || true
const fs = require('node:fs')
const [file, dep, spec] = process.argv.slice(2)
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
manifest.dependencies ??= {}
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []
let changed = false
if (manifest.dependencies[dep] !== spec) {
  manifest.dependencies[dep] = spec
  changed = true
}
if (!manifest.dsh.profile.bundles.includes(dep)) {
  manifest.dsh.profile.bundles.push(dep)
  changed = true
}
if (changed) fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
NODE

  mkdir -p "$PROFILE_DIR/node_modules"
  current="$(readlink "$LINK" 2>/dev/null || true)"
  if [ ! -e "$LINK/lib/index.js" ] || [ "$current" != "$PLUGIN_DIR" ]; then
    echo "dsh-entrypoint: verlinke SearXNG-Plugin auf $PLUGIN_DIR" >&2
    rm -f "$LINK"
    ln -s "$PLUGIN_DIR" "$LINK"
  fi
fi

exec "$@"
