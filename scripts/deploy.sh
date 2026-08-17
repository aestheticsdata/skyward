#!/usr/bin/env bash
set -Eeuo pipefail

######################################
# Configuration
######################################
REMOTE_USER_HOST="${REMOTE_USER_HOST:-debian@ks-b}"
# Everything loamkeep owns on ks-b lives INSIDE this folder — live root front/, history
# front-releases/, backup front.bak/ — mirroring bkmk's layout, so /var/www holds exactly one
# entry per app. Releases and backup sit OUTSIDE the live root on purpose: the release switch
# empties front/ wholesale, and anything stored inside it would ride into the backup. Same fix
# as Shatter's SHA-38 and SHA-37, where this script came from.
WEB_ROOT_BASE="${WEB_ROOT_BASE:-/var/www/loamkeep}"
CURRENT_DIR="$WEB_ROOT_BASE/front"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT_BASE/front.bak}"
RELEASES_DIR="$WEB_ROOT_BASE/front-releases"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://loamkeep.1991computer.com/}"
EXPECTED_HTML_MARKER="${EXPECTED_HTML_MARKER:-Loamkeep}"
MAX_RELEASES_TO_KEEP="${MAX_RELEASES_TO_KEEP:-20}"
BUILD_BASE_PATH="${BUILD_BASE_PATH:-./}"

# The branch a deploy is allowed to ship. The tree must be clean and level with it — see
# `require_clean_tree`.
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

######################################
# Reporting to Zeus
######################################
# Loamkeep's slug in Zeus's port registry, and which half of it this script deploys. Zeus refuses a
# report naming an app the registry has never heard of; an unregistered *role* it records with a
# warning instead, because that means the registry is behind ks-b and dropping it would hide
# exactly that.
ZEUS_APP_NAME="${ZEUS_APP_NAME:-loamkeep}"
ZEUS_ROLE="front"

# The two files **on ks-b** that may hold the ingest URL and the shared secret, in the order
# Zeus's API itself resolves them — see `read_setting` in `zeus_report`.
#
# Read there rather than carried on the laptop, for two reasons. The secret never travels: it is
# read on ks-b, used on ks-b, and never appears in this repo or in an ssh command line where
# `ps` would show it. And the endpoint is loopback-only — a report has to be sent from ks-b
# whatever happens, because this script runs on a laptop that Zeus's nginx would refuse.
ZEUS_ECOSYSTEM_FILE="${ZEUS_ECOSYSTEM_FILE:-/var/www/zeus/ecosystem.config.js}"
ZEUS_ENV_FILE="${ZEUS_ENV_FILE:-/var/www/zeus/nest-api/.env}"

# The last successfully deployed commit — the base of the next report's commit range. It lives in
# the releases dir, outside the live root: the live root is emptied into the backup on every
# switch, so a marker kept there would ride into the backup. The prune only deletes directories,
# so it never collects this file.
ZEUS_MARKER="$RELEASES_DIR/.zeus-last-$ZEUS_ROLE"

######################################
# Utility
######################################
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "❌ ERROR: Missing required command '$command_name'" >&2
    exit 1
  }
}

######################################
# Reporting to Zeus
######################################
# Ported from Shatter's deploy script (SHA-28), itself ported from Spira's (SPI-52) and Zeus's
# own — the recipe in Zeus/docs/reporting/README.md.

# Refuse to ship a tree that is not exactly what is on the remote branch.
#
# The deploy uploads whatever the working tree holds — not what is committed and not what is
# pushed. The report to Zeus, though, describes HEAD: its commit hash and its range of commit
# messages. A dirty or unpushed tree would make every one of those a lie, so the check is part of
# the reporting port, not an extra.
#
# Runs before any ssh or rsync: the whole point is to fail on the laptop, with nothing on the
# server touched.
require_clean_tree() {
  cd "$PROJECT_DIR"

  local dirty
  dirty=$(git status --porcelain)
  if [ -n "$dirty" ]; then
    echo "❌ ERROR: refusing to deploy — the working tree is not clean:" >&2
    printf '%s\n' "$dirty" >&2
    echo "   commit, stash or clean these first." >&2
    exit 1
  fi

  # Without a fetch, `origin/$DEPLOY_BRANCH` is whatever this laptop last heard — exactly the stale
  # value that lets a behind-by-one tree deploy. A failure here is fatal on purpose: a deploy needs
  # the network anyway, so "cannot reach the remote" is never the moment to guess.
  if ! git fetch --quiet origin "$DEPLOY_BRANCH"; then
    echo "❌ ERROR: refusing to deploy — could not fetch origin/$DEPLOY_BRANCH to compare against." >&2
    exit 1
  fi

  local head remote
  head=$(git rev-parse HEAD)
  remote=$(git rev-parse FETCH_HEAD)

  if [ "$head" != "$remote" ]; then
    echo "❌ ERROR: refusing to deploy — HEAD does not match origin/$DEPLOY_BRANCH:" >&2
    echo "   local  $head" >&2
    echo "   remote $remote" >&2
    echo "   pull, push or check out the right branch first." >&2
    exit 1
  fi
}

# The commit the previous deploy shipped — the base of this deploy's commit range.
#
# Order: the marker (steady state) → a `ZEUS_SINCE` override → the newest release folder's hash →
# empty, which the consumer reads as "no baseline, fall back to the last ten commits".
#
# Resolved **once, before anything writes**. `write_zeus_marker` moves the marker at the end of a
# successful deploy, so a second resolution later in the run would return this deploy's own commit
# and the report would come out claiming nothing shipped.
resolve_base_hash() {
  local base
  base=$(ssh "$REMOTE_USER_HOST" "cat '$ZEUS_MARKER' 2>/dev/null || true" 2>/dev/null || true)
  [ -z "$base" ] && base="${ZEUS_SINCE:-}"
  [ -z "$base" ] && base="${PREV_FROM_SERVER:-}"

  # A hash this checkout does not have is no baseline at all — a shallow clone, or a marker left by
  # a deploy from a branch since rewritten.
  if [ -n "$base" ] && ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    base=""
  fi

  printf '%s' "$base"
}

# The commits this deploy ships, as a JSON array, newest first.
#
# `ZEUS_BASE_HASH` is the commit the last deploy shipped; with none — a first report — the last ten
# commits stand in for a range nobody can reconstruct.
#
# Every message is escaped in awk rather than interpolated into a shell string. `%s` is the subject
# line only, so it cannot contain a newline, and splitting on the first two spaces is exact because
# neither a sha nor an ISO-8601 date contains one.
zeus_commits_json() {
  local -a range

  # A manual rollback restores a release rather than shipping one. Falling through to the last-ten
  # baseline there would claim it delivered ten commits it had nothing to do with.
  if [ "${ZEUS_REPORT_COMMITS:-true}" != "true" ]; then
    printf '[]'
    return 0
  fi

  if [ -n "${ZEUS_BASE_HASH:-}" ]; then
    range=("${ZEUS_BASE_HASH}..HEAD")
  else
    range=(-n 10 HEAD)
  fi

  git log --no-merges --pretty=format:'%H %aI %s' "${range[@]}" 2>/dev/null | awk '
    BEGIN { printf "["; first = 1 }
    NF >= 3 {
      sha = $1
      when = $2
      msg = substr($0, length(sha) + length(when) + 3)
      gsub(/\\/, "\\\\", msg)
      gsub(/"/, "\\\"", msg)
      gsub(/\t/, " ", msg)
      if (!first) printf ","
      printf "{\"sha\":\"%s\",\"authoredAt\":\"%s\",\"message\":\"%s\"}", sha, when, msg
      first = 0
    }
    END { printf "]" }'
}

# Escape a value for a JSON string literal.
#
# `zeus_commits_json` escapes commit messages in awk because it reads them a line at a time. Every
# *other* string in the payload is interpolated by hand below, and one
# `zeus_report "failed" "could not read \"x\""` away from posting malformed JSON. Zeus would answer
# 400, and since every error on this path is swallowed the report would vanish with no symptom.
# Applied to every field rather than the ones that look risky, so nothing here needs re-deciding.
#
# Backslash first: the reverse order would escape the backslashes this step adds. Commit subjects
# and git ref names cannot contain a newline, so tab is the only control character left to handle.
json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/ }
  printf '%s' "$s"
}

# Tell Zeus what this deploy did: `zeus_report <success|failed|rolled_back> [summary]`.
#
# Three rules, from `Zeus/docs/reporting/README.md`, and none of them is optional:
#   1. reporting must never fail the deploy — every step here is `|| true`, and the caller ignores
#      the return value too;
#   2. fire and forget, 2 second timeout, no retries;
#   3. the payload travels as a **file**, never interpolated into a shell command, because commit
#      messages contain quotes, backticks and `$`.
#
# The POST happens on ks-b over ssh rather than from here: the endpoint is loopback-only and nginx
# denies it from outside ks-b.
zeus_report() {
  local status="$1"
  local summary="${2:-}"
  local commits payload remote_payload duration

  commits=$(zeus_commits_json 2>/dev/null || echo "[]")
  duration=$(( ($(date +%s) - ${ZEUS_STARTED_EPOCH:-$(date +%s)}) * 1000 ))
  payload=$(mktemp)
  remote_payload="/tmp/.zeus-deploy-report.$$.json"

  {
    printf '{"app":"%s","role":"%s","status":"%s"' \
      "$(json_escape "$ZEUS_APP_NAME")" "$(json_escape "$ZEUS_ROLE")" "$(json_escape "$status")"
    printf ',"startedAt":"%s","durationMs":%s' "$(json_escape "${ZEUS_STARTED_AT}")" "$duration"
    [ -n "${ZEUS_RELEASE:-}" ] && printf ',"release":"%s"' "$(json_escape "$ZEUS_RELEASE")"
    [ -n "${ZEUS_COMMIT:-}" ] && printf ',"commit":"%s"' "$(json_escape "$ZEUS_COMMIT")"
    [ -n "${ZEUS_BRANCH:-}" ] && printf ',"branch":"%s"' "$(json_escape "$ZEUS_BRANCH")"
    [ -n "$summary" ] && printf ',"summary":"%s"' "$(json_escape "$summary")"
    printf ',"commits":%s}' "$commits"
  } > "$payload"

  scp -q "$payload" "$REMOTE_USER_HOST:$remote_payload" || { rm -f "$payload"; return 0; }
  rm -f "$payload"

  ssh "$REMOTE_USER_HOST" \
    ZEUS_ECOSYSTEM_FILE="$ZEUS_ECOSYSTEM_FILE" \
    ZEUS_ENV_FILE="$ZEUS_ENV_FILE" \
    PAYLOAD="$remote_payload" \
    'bash -s' << 'EOF' || true
set -uo pipefail

cleanup() { rm -f "$PAYLOAD"; }
trap cleanup EXIT

# One setting, looked for in the pm2 ecosystem file first and the `.env` second.
#
# **That order is not a preference, it is the order Zeus's API itself resolves them.** pm2 injects
# `env_production` into the process environment before Nest starts, and dotenv does not overwrite a
# variable that is already there — so a value in the ecosystem file wins, and the `.env` is only
# consulted when the ecosystem file is silent. Reading the `.env` alone would present a token the
# API is not validating against the day the two files disagree, which is a `401` on every deploy
# report and no other symptom.
#
# Neither value is ever defaulted here. A fallback URL would put Zeus's port in this repo's source,
# which is the one place a port reassignment cannot rewrite — and since every error below is
# swallowed, a stale default would fail quietly and forever.
#
# `\042` and `\047` are the double and single quote, so a value written either way is unwrapped
# without this needing quotes of its own inside a heredoc.
read_setting() {
  local key="$1" value=""

  if [ -f "$ZEUS_ECOSYSTEM_FILE" ]; then
    value=$(sed -n "s/.*${key}: *['\"]\([^'\"]*\)['\"].*/\1/p" "$ZEUS_ECOSYSTEM_FILE" 2>/dev/null | tail -1)
  fi

  if [ -z "$value" ] && [ -f "$ZEUS_ENV_FILE" ]; then
    value=$(sed -n "s/^${key}=//p" "$ZEUS_ENV_FILE" 2>/dev/null | tail -1 | tr -d '\042\047')
  fi

  printf '%s' "$value"
}

url=$(read_setting ZEUS_DEPLOY_INGEST_URL)
token=$(read_setting ZEUS_INGEST_TOKEN)

if [ -z "$url" ] || [ -z "$token" ]; then
  echo "zeus: not reported — ZEUS_DEPLOY_INGEST_URL or ZEUS_INGEST_TOKEN found in neither" \
    "$ZEUS_ECOSYSTEM_FILE nor $ZEUS_ENV_FILE"
  exit 0
fi

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 \
  -X POST "$url" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $token" \
  --data-binary @"$PAYLOAD" || true)

# 202 is the contract. Anything else is worth one line in the deploy output and nothing more —
# a deploy that shipped and could not say so still shipped.
[ "$code" = "202" ] || echo "zeus: report not recorded (HTTP ${code:-none})"
EOF
}

# Move the marker to the commit this deploy just shipped. Only a hex hash travels, so inlining it
# in the ssh command is safe — everything else in the reporting path goes by file.
write_zeus_marker() {
  ssh "$REMOTE_USER_HOST" \
    "mkdir -p '$RELEASES_DIR' && printf '%s\n' '$(git rev-parse HEAD)' > '$ZEUS_MARKER'"
}

prepare_local_build() {
  log "➡️  Installing dependencies"
  cd "$PROJECT_DIR"
  pnpm install --frozen-lockfile

  # Mirrors `pnpm build` (tsc --noEmit && vite build): a deploy must not ship what the project's
  # own build gate would reject.
  log "➡️  Typechecking"
  pnpm exec tsc --noEmit

  log "➡️  Building production assets with base path: $BUILD_BASE_PATH"
  pnpm exec vite build --base="$BUILD_BASE_PATH"

  if [ ! -f "$PROJECT_DIR/dist/index.html" ]; then
    echo "❌ ERROR: dist/index.html is missing after build" >&2
    exit 1
  fi

  local expected_asset_prefix
  if [ "$BUILD_BASE_PATH" = "./" ]; then
    expected_asset_prefix="./assets/"
  else
    expected_asset_prefix="${BUILD_BASE_PATH}assets/"
  fi

  if ! grep -Fq "$expected_asset_prefix" "$PROJECT_DIR/dist/index.html"; then
    echo "❌ ERROR: dist/index.html does not contain the expected asset prefix: $expected_asset_prefix" >&2
    exit 1
  fi

}

write_release_metadata() {
  local release_name="$1"
  local git_hash="$2"
  local git_branch="$3"
  local timestamp="$4"

  cat > "$PROJECT_DIR/dist/release.json" <<__META__
{
  "release": "$release_name",
  "gitHash": "$git_hash",
  "gitBranch": "$git_branch",
  "builtAt": "$timestamp"
}
__META__
}

remote_prepare_staging() {
  local staging_dir="$1"

  ssh "$REMOTE_USER_HOST" RELEASES_DIR="$RELEASES_DIR" STAGING_DIR="$staging_dir" 'bash -s' <<'__REMOTE_PREPARE__'
set -Eeuo pipefail

mkdir -p "$RELEASES_DIR"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
__REMOTE_PREPARE__
}

remote_activate_from_dir() {
  local source_dir="$1"

  ssh "$REMOTE_USER_HOST" \
    CURRENT_DIR="$CURRENT_DIR" \
    BACKUP_DIR="$BACKUP_DIR" \
    SOURCE_DIR="$source_dir" \
    'bash -s' <<'__REMOTE_ACTIVATE__'
set -Eeuo pipefail

if [ ! -d "$SOURCE_DIR" ]; then
  echo "❌ ERROR: Source directory does not exist: $SOURCE_DIR" >&2
  exit 1
fi

# The live root holds served files and nothing else — releases and backup are siblings of it,
# so emptying it wholesale is safe and the release source stays valid throughout the switch.
mkdir -p "$CURRENT_DIR"
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

cd "$CURRENT_DIR"
shopt -s dotglob
if compgen -G "*" > /dev/null; then
  mv * "$BACKUP_DIR"/ 2>/dev/null || true
fi
shopt -u dotglob

cp -a "$SOURCE_DIR"/. "$CURRENT_DIR"/
__REMOTE_ACTIVATE__
}

remote_rollback_backup() {
  ssh "$REMOTE_USER_HOST" \
    CURRENT_DIR="$CURRENT_DIR" \
    BACKUP_DIR="$BACKUP_DIR" \
    'bash -s' <<'__REMOTE_ROLLBACK__'
set -Eeuo pipefail

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ ERROR: No backup directory found at $BACKUP_DIR" >&2
  exit 1
fi

mkdir -p "$CURRENT_DIR"
cd "$CURRENT_DIR"
shopt -s dotglob
if compgen -G "*" > /dev/null; then
  rm -rf * 2>/dev/null || true
fi
if compgen -G "$BACKUP_DIR/*" > /dev/null; then
  mv "$BACKUP_DIR"/* "$CURRENT_DIR"/ 2>/dev/null || true
fi
shopt -u dotglob

rm -rf "$BACKUP_DIR"
__REMOTE_ROLLBACK__
}

remote_prune_releases() {
  ssh "$REMOTE_USER_HOST" RELEASES_DIR="$RELEASES_DIR" MAX_KEEP="$MAX_RELEASES_TO_KEEP" 'bash -s' <<'__REMOTE_PRUNE__'
set -Eeuo pipefail

if [ ! -d "$RELEASES_DIR" ]; then
  exit 0
fi

release_count="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
if [ "$release_count" -le "$MAX_KEEP" ]; then
  exit 0
fi

to_delete=$((release_count - MAX_KEEP))
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | head -n "$to_delete" | while IFS= read -r release_name; do
  rm -rf "$RELEASES_DIR/$release_name"
done
__REMOTE_PRUNE__
}

run_healthcheck() {
  local mode="${1:-strict}"

  require_command curl

  local response
  response="$(curl -fsSL --max-time 15 "$HEALTHCHECK_URL")"

  if [ "$mode" = "status-only" ]; then
    return 0
  fi

  if ! grep -Fq "$EXPECTED_HTML_MARKER" <<< "$response"; then
    echo "❌ ERROR: Healthcheck marker not found: $EXPECTED_HTML_MARKER" >&2
    exit 1
  fi

  if ! grep -Eq '(\./assets/|/assets/)' <<< "$response"; then
    echo "❌ ERROR: Healthcheck HTML does not reference any expected asset path" >&2
    exit 1
  fi

  local origin
  origin="$(sed -E 's#^(https?://[^/]+).*$#\1#' <<< "$HEALTHCHECK_URL")"

  local asset_urls=()
  while IFS= read -r asset_url; do
    asset_urls+=("$asset_url")
  done < <(grep -oE '(src|href)="[^"]+\.(js|css)"' <<< "$response" | sed -E 's/^(src|href)="(.*)"$/\2/' | sort -u)

  if [ "${#asset_urls[@]}" -eq 0 ]; then
    echo "❌ ERROR: Healthcheck could not find any JS/CSS asset URLs in HTML" >&2
    exit 1
  fi

  local asset_url
  for asset_url in "${asset_urls[@]}"; do
    local asset_full_url
    case "$asset_url" in
      http://*|https://*)
        asset_full_url="$asset_url"
        ;;
      /*)
        asset_full_url="$origin$asset_url"
        ;;
      ./*)
        asset_full_url="${HEALTHCHECK_URL%/}/${asset_url#./}"
        ;;
      *)
        asset_full_url="${HEALTHCHECK_URL%/}/$asset_url"
        ;;
    esac

    curl -fsSL --max-time 15 -o /dev/null "$asset_full_url"
  done
}

list_releases() {
  log "➡️  Remote release list"
  ssh "$REMOTE_USER_HOST" RELEASES_DIR="$RELEASES_DIR" 'bash -s' <<'__REMOTE_LIST__'
set -Eeuo pipefail

if [ ! -d "$RELEASES_DIR" ]; then
  echo "No releases directory: $RELEASES_DIR"
  exit 0
fi

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r
__REMOTE_LIST__
}

deploy() {
  require_command git
  require_command pnpm
  require_command ssh
  require_command rsync

  cd "$PROJECT_DIR"

  # Before any ssh or rsync — see the function itself for why this guards the report's honesty.
  require_clean_tree

  local git_hash
  git_hash="$(git rev-parse --short HEAD 2>/dev/null || echo no-git)"

  local git_branch_raw
  git_branch_raw="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo no-branch)"

  local git_branch
  git_branch="${git_branch_raw//\//-}"
  git_branch="${git_branch// /_}"

  local timestamp
  timestamp="$(date +'%Y%m%d-%H%M%S')"

  local release_name="release-${timestamp}-${git_branch}-${git_hash}"
  local staging_dir="$RELEASES_DIR/$release_name"
  local switch_done="false"

  # Current live commit, read from the newest release folder name (…-<hash>) before this deploy's
  # own staging folder is created. Seeds the commit range on the very first run, when no marker
  # exists yet. Non-fatal: an empty value falls back to the last-10 baseline.
  local PREV_FROM_SERVER
  PREV_FROM_SERVER=$(ssh "$REMOTE_USER_HOST" "ls -1 '$RELEASES_DIR' 2>/dev/null | sort | tail -1" 2>/dev/null \
    | sed -nE 's/.*-([0-9a-f]{7,40})$/\1/p' || true)

  # What the report to Zeus will carry, gathered here so that a deploy which fails at its very
  # first step still reports something true. Not `local`: `zeus_report` is defined outside this
  # function, and the failure path calls it from the ERR trap.
  ZEUS_STARTED_AT=$(date -u +%FT%TZ)
  ZEUS_STARTED_EPOCH=$(date +%s)
  ZEUS_RELEASE="$release_name"
  ZEUS_BRANCH="$git_branch_raw"
  ZEUS_COMMIT=$(git rev-parse HEAD 2>/dev/null || true)
  ZEUS_BASE_HASH=$(resolve_base_hash)

  on_error() {
    local lineno="$1"
    log "❌ ERROR: Deployment failed at line $lineno"

    if [[ "$switch_done" == "true" ]]; then
      log "↩️  Auto rollback to previous live version"
      if remote_rollback_backup; then
        log "✅ Auto rollback succeeded"
        # `rolled_back`, not `failed`, and the distinction is the whole reason Zeus has three
        # statuses: the deploy did fail, and ks-b is serving exactly what it served before.
        zeus_report "rolled_back" "deploy failed at line $lineno — previous release restored" || true
      else
        log "❌ Auto rollback failed, manual intervention required"
        zeus_report "failed" "deploy failed at line $lineno — rollback failed too" || true
      fi
    else
      log "ℹ️  No rollback needed (live version was not switched)"
      zeus_report "failed" "deploy failed at line $lineno — production was not modified" || true
    fi
  }

  trap 'on_error $LINENO' ERR

  prepare_local_build
  write_release_metadata "$release_name" "$git_hash" "$git_branch" "$timestamp"

  log "➡️  Preparing remote staging directory: $staging_dir"
  remote_prepare_staging "$staging_dir"

  log "➡️  Uploading dist/ to remote staging"
  rsync -az --delete "$PROJECT_DIR/dist/" "$REMOTE_USER_HOST:$staging_dir/"

  log "➡️  Activating release"
  switch_done="true"
  remote_activate_from_dir "$staging_dir"

  log "➡️  Running healthcheck: $HEALTHCHECK_URL"
  run_healthcheck strict

  log "➡️  Pruning old releases (keep: $MAX_RELEASES_TO_KEEP)"
  remote_prune_releases

  trap - ERR

  write_zeus_marker || log "⚠️  Zeus marker not moved — the next report's commit range will overshoot (non-fatal)"
  zeus_report "success" || log "⚠️  Zeus was not told about this deploy (non-fatal)"

  log "✅ Deployment completed: $release_name"
  log "ℹ️  Current live directory: $CURRENT_DIR"
  log "ℹ️  Backup available at: $BACKUP_DIR"
  log "ℹ️  Releases directory: $RELEASES_DIR"
}

rollback() {
  log "↩️  Manual rollback to backup version"

  # A manual rollback is reported for the same reason an automatic one is: it changes what is live,
  # and Zeus's whole claim is to know which build each service is serving. It ships no commits — see
  # `zeus_commits_json` — and names no release, because the release it restores is whatever was in
  # the backup directory and this script never learns its name.
  ZEUS_STARTED_AT=$(date -u +%FT%TZ)
  ZEUS_STARTED_EPOCH=$(date +%s)
  ZEUS_REPORT_COMMITS="false"

  if remote_rollback_backup; then
    zeus_report "rolled_back" "manual rollback — the previous release is live again" || true
  else
    log "❌ Rollback failed. Check server state manually."
    zeus_report "failed" "manual rollback failed — ks-b needs looking at" || true
    exit 1
  fi

  log "➡️  Running healthcheck: $HEALTHCHECK_URL"
  run_healthcheck status-only
  log "✅ Rollback completed"
}

rollback_to_release() {
  local release_name="${1:-}"

  if [ -z "$release_name" ]; then
    echo "Usage: $0 rollback-to <release_name>" >&2
    exit 1
  fi

  local release_dir="$RELEASES_DIR/$release_name"

  log "↩️  Manual rollback to release: $release_name"

  # Same contract as `rollback`, with one difference: this variant knows exactly which release it
  # restores, so the report names it.
  ZEUS_STARTED_AT=$(date -u +%FT%TZ)
  ZEUS_STARTED_EPOCH=$(date +%s)
  ZEUS_REPORT_COMMITS="false"
  ZEUS_RELEASE="$release_name"

  if remote_activate_from_dir "$release_dir"; then
    zeus_report "rolled_back" "manual rollback to $release_name" || true
  else
    log "❌ Rollback-to-release failed. Check server state manually."
    zeus_report "failed" "manual rollback to $release_name failed — ks-b needs looking at" || true
    exit 1
  fi

  log "➡️  Running healthcheck: $HEALTHCHECK_URL"
  run_healthcheck status-only
  log "✅ Rollback-to-release completed"
}

######################################
# Entry point
######################################
ACTION="${1:-deploy}"

case "$ACTION" in
  deploy)
    deploy
    ;;
  rollback)
    rollback
    ;;
  rollback-to)
    rollback_to_release "${2:-}"
    ;;
  list-releases)
    list_releases
    ;;
  *)
    echo "Usage: $0 [deploy|rollback|rollback-to <release_name>|list-releases]" >&2
    exit 1
    ;;
esac
