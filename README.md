# DSH Dockerized

Runs [DeepSeek Harness (`dsh`)](https://www.npmjs.com/package/@deepseek-ai/dsh) inside an isolated
Docker container — the same concept as
[pi-mono-dockerized](https://github.com/ei23fxg/pi-mono-dockerized), applied to DSH: the whole
toolchain (Node, Rust, Go, Python, PHP, build tools) lives in the image; settings, patches,
sessions and attachments stay in the host's `~/.dsh`. One command starts it: `dsh`.

> **Note:** Bash script, **Linux only**. The first start builds the image — give it a few minutes.

## Quick start

```bash
alias dsh="bash /path/to/dsh-dockerized/dsh"   # add to ~/.bashrc
dsh              # web UI in the fixed working home (~/dsh-home); URL + token printed in the terminal
dsh -m           # mount the current directory as workspace, then web UI
dsh -m headless "fix the tests"   # one-shot task in the terminal, prints the answer
```

`dsh` without arguments starts the **web profile** with `--no-open`; it prints a `dsh web:` line
with a tokenized URL (e.g. `http://127.0.0.1:3080/#<token>`) — open it in a browser on the Docker
host. DSH does not currently ship an interactive TUI profile; for terminal work use `headless`
(one-shot task) or `dsh plugin ...`/launcher flags.

## Working modes

| Command | Effect |
|---|---|
| `dsh` | Fixed working home `~/dsh-home`, web UI on port 3080 |
| `dsh -m` | Mounts the current directory as workspace (web UI) |
| `dsh -ro -m` | Same, but workspace mounted **read-only** |
| `dsh -m README.md "MY FILE.md"` | Mounts only these files; everything else stays on the host |
| `dsh headless "prompt"` | One-shot task in the fixed home (prints the result, exits) |
| `dsh -m headless "prompt"` | One-shot task in the current project |
| `dsh web --port 3081` | Web profile with its own flags (custom port, `--host`, TLS …) |
| `dsh <name> …` | Boot a custom profile (e.g. `rescue`) |
| `dsh plugin --profile web add <pkg>` | Plugin management (pnpm inside the profile, persistent in `~/.dsh`) |
| `dsh --help` / `dsh --version` | Launcher help/version straight from the container |
| `dsh --show-hidden -m` | One-off: show all project files hidden by default |
| `dsh rebuild` | Rebuild the image (`DSHD_VERSION=0.2.3 dsh rebuild` pins a version) |

- `-m`, `-ro`, `--show-hidden` and `rebuild` are wrapper flags; everything else is passed through
  unchanged to `dsh` inside the container. After `-m`, a bare `web` always means web start, never
  a path — a folder named `web` gets mounted as `./web`.
- **Read-only mode (`-ro`)** — order-flexible (`dsh -ro -m`, `dsh -m -ro`, also with
  `dsh -ro -m FILE…`): the workspace bind gets `:ro`, enforced by Docker, not by prompting. The
  container sees `DSHD_READ_ONLY=1` and the seeded prompt tells the agent not to fight it — expect
  changes as diffs, scratch files go to `$HOME`. Deliberately still writable: `~/dsh-home`,
  `~/.dsh`, session storage and `mounts.conf` targets (sessions must persist). Git auto-init is
  skipped (the repo would land inside the read-only project); `-ro` without `-m` prints a warning
  and does nothing. For pre-existing `~/.dsh` the prompt hint is not added automatically — copy it
  from [`examples/dsh/cordis.patch.yml`](examples/dsh/cordis.patch.yml).
- Each session belongs to its context (fixed home vs. one session folder per project); you never
  see sessions from other projects — DSH stores sessions by workspace path
  (`~/.dsh/sessions/--<encoded path>--`), and the wrapper isolates that via a session-root mount.

## Web UI

DSH binds to loopback inside the container; the wrapper always runs with **host networking**, so the
printed URL works directly on the Docker host — no `-p`/`ports:` needed. From another machine,
tunnel it, e.g. `ssh -N -L 3080:127.0.0.1:3080 user@dockerhost`. The token in the URL is the
authentication; the web UI is not meant for the open internet. Two concurrent web sessions need
different ports (`DSHD_PORT=3081 dsh -m web`).

## Privacy & isolation — how the separation works

- One container per context, ephemeral (`--rm`), running as your host UID/GID — created files are
  owned by you.
- Only these are visible: host `~/.dsh` (config/sessions), the mounted workspace, the working home,
  and whatever you list in `~/.dsh/mounts.conf` — never the whole host.
- A full `-m` project hides `.env`, `.secret`, `.deploy`, `.build`, `.vscode`, various ignore files
  and a project-local `.dsh/` (via `/dev/null`/empty-directory mounts). `.git`, `.gitignore` and
  `.gitmodules` are visible — `DSHD_ALLOW_GIT=0` hides them too.
- Telemetry off by default: wrapper env flags plus component-level kills in the home patch —
  details in [Disabling telemetry — completely](#disabling-telemetry--completely).

## Configuration

Created once, existing files are **never** overwritten (templates in
[`examples/dsh/`](examples/dsh/)):

```
~/.dsh/cordis.patch.yml   # home-patch layer: SearXNG, telemetry off, model providers, system prompt
~/.dsh/AGENTS.md          # global instructions (DSH appends them to every session)
~/.dsh/mounts.conf        # persistent extra mounts + managed entry for ~/dsh-home
~/.dsh/<API_KEY>          # key files, e.g. ~/.dsh/STRATA_API_KEY (chmod 600)
```

DSH's patch layers: bundles → profile patch → **home patch** (`~/.dsh/cordis.patch.yml`) →
`--patch` overlays. The home patch applies to all profiles — exactly the right place for providers,
privacy disables and model defaults.

**API keys:** files like `~/.dsh/DEEPSEEK_API_KEY`, `STRATA_API_KEY`, `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `HF_TOKEN`, `GH_TOKEN`,
`GITHUB_TOKEN` — or already-set host environment variables are passed through.
Additional names (e.g. `DB_HOST`/`DB_USER` as in the old Compose setup) via `DSHD_EXTRA_ENV`.

**SearXNG search:** the `dsh-web-search-searxng` plugin is baked into the image
(`/opt/dsh-plugins/searxng`); on every start, `dsh-entrypoint` idempotently repairs its
registration in the booted profile. Point it at your instance via `baseURL` in the home patch.

### Extra mounts

Persistent extra mounts in `~/.dsh/mounts.conf` (one mount per line):

```text
# <host-path>:<container-path>[:ro|:rw]
~/shared:/shared:ro
/opt/resolve/bin/ResolveMCP:/opt/resolve/bin/ResolveMCP
```

### Wrapper variables

Shell environment variables **on the host** (not in DSH configuration):

```bash
DSHD_PORT=3081 dsh web     # this start only
export DSHD_ALLOW_GIT=0    # all future starts
```

| Variable | Default | Purpose |
|---|---|---|
| `DSHD_ALLOW_GIT` | `1` | `0` hides `.git`, `.gitignore`, `.gitmodules` |
| `DSHD_GIT_AUTOINIT` | `1` | `0` skips `git init` + snapshot commit for projects without a repo |
| `DSHD_SHOW_HIDDEN` | `0` | `1` shows all hidden project files |
| `DSHD_GIT_NAME` / `DSHD_GIT_EMAIL` | host values | commit identity inside the container |
| `DSHD_HOME_DIR` | `~/dsh-home` | host source directory of the fixed working home |
| `DSHD_MOUNT_CWD` | `0` | `1` behaves like `dsh -m` always |
| `DSHD_READ_ONLY` | `0` | `1` behaves like `dsh -ro` (read-only `-m` workspace) |
| `DSHD_MOUNTS_FILE` | `~/.dsh/mounts.conf` | location of the extra-mounts file |
| `DSHD_PORT` | `3080` | web UI port |
| `DSHD_OPEN_BROWSER` | `0` | `1` drops `--no-open` (little use inside the container) |
| `DSHD_EXTRA_ENV` | `DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME` | host env var names to pass through |
| `DSHD_VERSION` | `latest` | DSH version baked into the image (change ⇒ rebuild) |
| `DSHD_RUST_VERSION` | `stable` | Rust toolchain in the image (change ⇒ rebuild) |

## Disabling telemetry — completely

Two layers. The wrapper already sets up **both** by default; on an existing `~/.dsh` only layer 2
may need the block added manually.

**1. Environment variables** — the wrapper passes these into *every* container start:

```bash
DSH_TELEMETRY_DISABLED=1    # DSH: hard off
DSH_TELEMETRY_MODE=DISABLED # DSH: mode switch
DO_NOT_TRACK=1              # honored by many other CLIs too
NPM_CONFIG_UPDATE_NOTIFIER=false
```

These are hardcoded, not user-overridable host env — if you ever want a flag back
deliberately, list its name in `DSHD_EXTRA_ENV`: pass-through `-e` args are appended
*after* the defaults, so they win, e.g.
`DSHD_EXTRA_ENV="$DSHD_EXTRA_ENV DSH_TELEMETRY_MODE" DSH_TELEMETRY_MODE=ENABLED dsh …`.

**2. Component kills in the home patch** — env flags silence the transport; this list additionally
unloads the telemetry components themselves (nothing loaded, nothing registered). It is seeded
automatically into a fresh `~/.dsh/cordis.patch.yml` (full template:
[`examples/dsh/cordis.patch.yml`](examples/dsh/cordis.patch.yml)); if your file predates this repo,
append the block:

```yaml
# privacy: kill telemetry/analytics completely
- id: session-telemetry-otel
  disabled: true
- id: otel                              # shared OTLP transport
  disabled: true
- id: session-log-deepseek
  disabled: true
- id: plugin-package-inventory-deepseek # attaches plugin list to requests
  disabled: true
- id: desktop-product-telemetry
  disabled: true
- id: product-analytics
  disabled: true
- id: command-feedback                  # optional; removes the rating buttons
  disabled: true
- id: message-feedback
  disabled: true
- id: ui-message-feedback
  disabled: true
```

The home patch applies to **all profiles**, so this holds for web, headless and custom profiles
alike. Remember: a patch entry replaces the whole config of that row — keep other settings of a
disabled id's row in mind when reordering your patch file.

## Image & updates

DSH is built **into the image** (`npm install -g @deepseek-ai/dsh@<DSHD_VERSION>`).
Update: `dsh rebuild` (pulls `@latest`) or reproducible: `DSHD_VERSION=0.2.3 dsh rebuild`.
The image rebuilds automatically when the build stamp changes
(`DSHD_VERSION`/`DSHD_RUST_VERSION`). Profiles and plugins survive a rebuild — they live in
`~/.dsh`. Image and volume are labeled `dsh-dockerized.managed=true`; avoid unfiltered
`docker image prune -a` / `docker system prune -a`.

## Git

The agent uses regular `git` inside the container. Local commits work with your host identity
(`git config --global user.name/user.email` or `DSHD_GIT_NAME`/`DSHD_GIT_EMAIL`); without host
values the fallback is `DSH Agent <agent@dsh-dockerized.local>`. An `-m` project **without** a
repo gets `git init` plus an `initial workspace snapshot` commit at startup — every agent phase has
a diffable baseline that way (`DSHD_GIT_AUTOINIT=0` to disable). **Push is not set up** (no SSH
keys/credentials in the container); if you want it, deliberately expose credentials via
`mounts.conf`.

## Living with the host `~/.dsh`

The wrapper puts nothing into your home apart from `~/dsh-home`. If you previously ran DSH directly
on the host, all existing files (`cordis.patch.yml`, profiles, sessions) stay untouched and keep
being used — the container writes into the same structure.

## Troubleshooting

- **First start is slow?** Normal — image build. A later rebuild means: build cache/label changed
  or the image was pruned. Details: [docs/troubleshooting.md](docs/troubleshooting.md).
- **Port taken?** Two web contexts in parallel → use different `DSHD_PORT` values.
- **Session history empty?** You are booting in a different context (fixed home vs. `-m` project);
  sessions are separated per workspace.
- `Warning: dsh-entrypoint: …` on first start = a fresh profile is being initialized (network needed).

More: [docs/troubleshooting.md](docs/troubleshooting.md).

## Disclaimer

**Use at your own risk.** Same as with
[pi-mono-dockerized](https://github.com/ei23fxg/pi-mono-dockerized): API keys, mounts and
credentials are your responsibility; review AI-generated code before using it. Unofficial wrapper,
no affiliation with DeepSeek/dsh.
