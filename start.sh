#!/usr/bin/env bash

set -u

# ============================================================
# Piano Academy - start it on this computer
# Linux / macOS
#
# Finds PHP (8.2 or newer, with pdo_pgsql and openssl), builds the
# app once (again only after an update - that needs Node.js),
# brings the database up to date, starts PHP's web server with the
# backend serving the app, and opens the browser. Ctrl+C stops it.
#
# The first time it opens the setup page instead: it asks for your
# PostgreSQL connection, switches sign-in off (this computer only,
# no login) and brings in your old progress from server/data/.
# ============================================================

PROJECT_NAME="Piano Academy"

# Where the app answers: http://127.0.0.1:8300 (PIANO_PORT changes the port).
PORT="${PIANO_PORT:-8300}"
APP_URL="http://127.0.0.1:$PORT"

# How long to wait for the server to start.
SERVER_STARTUP_TIMEOUT=30

# ------------------------------------------------------------
# Colors
# ------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

info() {
    echo -e "${CYAN}$1${NC}"
}

success() {
    echo -e "${GREEN}$1${NC}"
}

warning() {
    echo -e "${YELLOW}$1${NC}"
}

error() {
    echo -e "${RED}$1${NC}"
}

die() {
    error ""
    error "ERROR: $1"
    echo ""
    exit 1
}

# Prints nothing when this PHP can run the app, else the reason it can't.
php_problem() {
    local php="$1" version major minor modules missing=""

    version="$("$php" -v 2>/dev/null | sed -n 's/^PHP \([0-9][0-9]*\.[0-9][0-9]*\.[^ ]*\).*/\1/p' | head -n 1)"
    if [ -z "$version" ]; then
        echo "does not run"
        return
    fi
    major="${version%%.*}"
    minor="${version#*.}"
    minor="${minor%%.*}"
    if [ "$major" -lt 8 ] || { [ "$major" -eq 8 ] && [ "$minor" -lt 2 ]; }; then
        echo "PHP $version is too old"
        return
    fi

    modules="$("$php" -m 2>/dev/null)"
    for ext in pdo_pgsql openssl; do
        if ! printf '%s\n' "$modules" | grep -qix "$ext"; then
            missing="$missing $ext"
        fi
    done
    if [ -n "$missing" ]; then
        echo "PHP $version lacks$missing"
    fi
}

# Every php worth trying: PIANO_PHP, PATH, the usual install folders.
php_candidates() {
    {
        [ -n "${PIANO_PHP:-}" ] && echo "$PIANO_PHP"
        type -ap php 2>/dev/null
        echo /opt/homebrew/bin/php
        echo /usr/local/bin/php
        echo /usr/bin/php
    } | awk '!seen[$0]++' | while read -r candidate; do
        [ -x "$candidate" ] && echo "$candidate"
    done
}

open_browser() {
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$1" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "$1"
    else
        warning "Open $1 in your browser."
    fi
}

# The status of GET /api/health: 200 running, 503 running but not set up, 0 nothing.
health_status() {
    if command -v curl >/dev/null 2>&1; then
        curl -s -o /dev/null -m 2 -w '%{http_code}' "$APP_URL/api/health" 2>/dev/null || echo 0
    else
        "$PHP" -r '$c = stream_context_create(["http" => ["ignore_errors" => true, "timeout" => 2]]); $s = @fopen($argv[1] . "/api/health", "rb", false, $c); if ($s === false) { echo 0; exit; } $m = stream_get_meta_data($s); fclose($s); echo preg_match("~^HTTP/\\S+\\s+(\\d{3})~", $m["wrapper_data"][0] ?? "", $x) ? $x[1] : 0;' "$APP_URL" 2>/dev/null || echo 0
    fi
}

# ------------------------------------------------------------
# Header
# ------------------------------------------------------------

clear 2>/dev/null || true

echo ""
echo -e "${BOLD}==============================================${NC}"
echo -e "${BOLD}  $PROJECT_NAME${NC}"
echo -e "${BOLD}==============================================${NC}"
echo ""

# ------------------------------------------------------------
# 1. The project folder
# ------------------------------------------------------------

# The folder of this script, wherever it was started from.
cd "$(dirname "$0")" || die "Cannot enter the folder of this script."
ROOT="$(pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

if [ ! -f "$BACKEND/router.php" ] || [ ! -f "$FRONTEND/package.json" ]; then
    die "backend/ or frontend/ is missing. This script belongs in the $PROJECT_NAME folder."
fi

# ------------------------------------------------------------
# 2. PHP
# ------------------------------------------------------------

info "Looking for PHP 8.2+ with pdo_pgsql and openssl..."

PHP=""
TRIED=""

while read -r candidate; do
    problem="$(php_problem "$candidate")"
    if [ -z "$problem" ]; then
        PHP="$candidate"
        break
    fi
    TRIED="$TRIED
    $candidate  ($problem)"
done <<EOF
$(php_candidates)
EOF

if [ -z "$PHP" ]; then
    if [ -n "$TRIED" ]; then
        error "Tried:$TRIED"
    fi
    die "No PHP 8.2 or newer with the extensions pdo_pgsql and openssl was found.

To install it:
    macOS (Homebrew):   brew install php
    Debian / Ubuntu:    sudo apt install php-cli php-pgsql php-curl
    Fedora:             sudo dnf install php-cli php-pgsql

Or set PIANO_PHP to the php to use. Then run this script again."
fi

success "PHP: $PHP"
echo ""

# ------------------------------------------------------------
# 3. The app (built once; again after an update)
# ------------------------------------------------------------

BUILT_INDEX="$FRONTEND/dist/piano-academy/browser/index.html"
NEEDS_BUILD=0
if [ ! -f "$BUILT_INDEX" ]; then
    NEEDS_BUILD=1
elif [ -n "$(find "$FRONTEND/src" "$FRONTEND/public" "$FRONTEND/package.json" "$FRONTEND/package-lock.json" "$FRONTEND/angular.json" -newer "$BUILT_INDEX" -print -quit 2>/dev/null)" ]; then
    NEEDS_BUILD=1
fi

if [ "$NEEDS_BUILD" -eq 1 ]; then
    if ! command -v npm >/dev/null 2>&1; then
        if [ -f "$BUILT_INDEX" ]; then
            warning "The app has changed since it was built, and Node.js is not installed to build it again."
            warning "Starting the build you have. (Install Node.js 22 from https://nodejs.org to update it.)"
            echo ""
        else
            die "The app has not been built yet, and building it needs Node.js.

Install Node.js 22 (LTS) from https://nodejs.org, then run this script
again. It builds the app once; after that it starts without Node.js."
        fi
    else
        if [ ! -d "$FRONTEND/node_modules" ]; then
            info "Downloading what the app is built with (npm ci, once)..."
            (cd "$FRONTEND" && npm ci --no-audit --no-fund) || die "npm ci did not finish: the messages above say why."
        fi
        info "Building the app (a minute at most)..."
        (cd "$FRONTEND" && npm run build) || die "The app did not build: the messages above say why."
        success "The app is built."
        echo ""
    fi
fi

# ------------------------------------------------------------
# 4. The database (once it is set up)
# ------------------------------------------------------------

if [ -f "$BACKEND/config/database.local.php" ] && [ -f "$BACKEND/config/auth.local.php" ]; then
    info "Bringing the database up to date..."
    if ! (cd "$BACKEND" && "$PHP" migration.php); then
        die "The database could not be brought up to date: the message above says why.

PostgreSQL must be installed and running
(https://www.postgresql.org/download/). The connection is in
backend/config/database.local.php - to enter it again, open
$APP_URL/setup.php while the app runs."
    fi
    echo ""
fi

# ------------------------------------------------------------
# 5. Start
# ------------------------------------------------------------

case "$(health_status)" in
    200)
        success "$PROJECT_NAME is already running."
        open_browser "$APP_URL"
        exit 0
        ;;
    503)
        success "$PROJECT_NAME is already running, and not set up yet."
        open_browser "$APP_URL/setup.php"
        exit 0
        ;;
esac

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Port $PORT is taken:
$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN)

If that is an older copy of this app, stop it first - or start on another
port: PIANO_PORT=8310 ./start.sh"
fi

info "Starting $PROJECT_NAME..."

TEMP_DIR="${TMPDIR:-/tmp}/PianoAcademy"
STDOUT_FILE="$TEMP_DIR/server.stdout.log"
STDERR_FILE="$TEMP_DIR/server.stderr.log"

mkdir -p "$TEMP_DIR"
rm -f "$STDOUT_FILE" "$STDERR_FILE"

# 127.0.0.1 only: without a login, nobody but this computer may reach the app.
(cd "$BACKEND" && exec "$PHP" -d display_errors=stderr -S "127.0.0.1:$PORT" router.php) >"$STDOUT_FILE" 2>"$STDERR_FILE" &
SERVER_PID=$!

# Ctrl+C lands here too: stop the server (and anything it started).
stop_server() {
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        pkill -P "$SERVER_PID" 2>/dev/null
        kill "$SERVER_PID" 2>/dev/null
    fi
    rm -f "$STDOUT_FILE" "$STDERR_FILE"
}
trap stop_server EXIT
trap 'exit 130' INT TERM

info "Waiting for $APP_URL..."

STATUS=0
for _ in $(seq 1 $((SERVER_STARTUP_TIMEOUT * 2))); do
    sleep 0.5
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        break
    fi
    STATUS="$(health_status)"
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "503" ]; then
        break
    fi
done

if [ "$STATUS" != "200" ] && [ "$STATUS" != "503" ]; then
    error "The server did not start."
    echo ""
    tail -n 20 "$STDERR_FILE" 2>/dev/null
    exit 1
fi

success "Server is ready."
echo ""

if [ "$STATUS" = "503" ]; then
    warning "$PROJECT_NAME is not set up yet: the setup page opens in your browser."
    warning "When it says Saved, press 'Open Piano Academy'."
    open_browser "$APP_URL/setup.php"
else
    info "Opening $APP_URL..."
    open_browser "$APP_URL"
fi

echo ""
success "$PROJECT_NAME is running at $APP_URL"
echo ""
echo "Press Ctrl+C to stop it."
echo ""

wait "$SERVER_PID"
