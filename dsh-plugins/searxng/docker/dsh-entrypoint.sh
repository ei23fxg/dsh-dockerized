#!/bin/sh
# Stellt beim Containerstart sicher, dass das im Image gebackene SearXNG-Plugin
# im DSH-Profil registriert ist.
#
# Hintergrund: /root/.dsh ist in der Praxis ein Volume/Bind-Mount. Inhalt, der
# beim Image-Build dort erzeugt wurde, wird davon verdeckt; außerdem kann ein
# altes Profil noch auf einen Workspace-Pfad zeigen, der nicht mehr existiert.
# Dieses Skript ist idempotent: es schreibt die Abhängigkeit auf den stabilen
# Image-Pfad, ergänzt das Bundle und repariert den Symlink.
set -eu

DSH_HOME_DIR="${DSH_HOME:-/root/.dsh}"
PROFILE_DIR="$DSH_HOME_DIR/profiles/web"
PLUGIN_DIR="${SEARXNG_PLUGIN_DIR:-/opt/dsh-plugins/searxng}"
DEP="dsh-web-search-searxng"
LINK="$PROFILE_DIR/node_modules/$DEP"

# Ohne gebackenes Plugin nichts tun (z. B. wenn die Zeilen entfernt wurden).
if [ ! -d "$PLUGIN_DIR" ]; then
  exec "$@"
fi

# Frisches/leeres Profil: DSH legt Manifest und Bundle-Liste selbst an.
if [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "dsh-entrypoint: initialisiere Web-Profil mit SearXNG-Plugin" >&2
  dsh plugin --profile web add "$PLUGIN_DIR" >&2 || true
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
