#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# OpenCode SFX - Installer
# ---------------------------------------------------------------------------
# Installs the sound effects plugin into your OpenCode config.
#
# Usage:
#   # From a cloned repo:
#   ./install.sh
#
#   # One-liner (clones the repo for you):
#   curl -fsSL https://raw.githubusercontent.com/jimrubenstein/opencode-sfx/main/install.sh | bash
#
#   # Non-interactive (accepts all defaults):
#   ./install.sh --yes
#   curl -fsSL https://raw.githubusercontent.com/jimrubenstein/opencode-sfx/main/install.sh | bash -s -- --yes
# ---------------------------------------------------------------------------

REPO_URL="https://github.com/jimrubenstein/opencode-sfx.git"
DEFAULT_INSTALL_DIR="$HOME/.config/opencode/plugins/opencode-sfx"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BOLD}$1${NC}"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
  esac
done

# Helper: prompt user or auto-accept in non-interactive mode
confirm() {
  local prompt="$1"
  local default="${2:-Y}"
  if [ "$AUTO_YES" = true ]; then
    return 0
  fi
  read -rp "$prompt " answer
  case "$default" in
    Y) [[ ! "$answer" =~ ^[Nn] ]] ;;
    N) [[ "$answer" =~ ^[Yy] ]] ;;
  esac
}

echo ""
info "OpenCode SFX Installer"
echo "  Sound effects plugin for OpenCode"
echo ""

# ---------------------------------------------------------------------------
# Determine plugin directory (clone if needed)
# ---------------------------------------------------------------------------

# Check if we're running from inside the repo already
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/plugin.ts" ] && [ -f "$SCRIPT_DIR/package.json" ]; then
  # Running from inside the repo (git clone && ./install.sh)
  PLUGIN_DIR="$SCRIPT_DIR"
  ok "Running from cloned repo: $PLUGIN_DIR"
else
  # Running via curl | bash — need to clone the repo
  PLUGIN_DIR="$DEFAULT_INSTALL_DIR"

  if [ -d "$PLUGIN_DIR/.git" ] && [ -f "$PLUGIN_DIR/plugin.ts" ]; then
    info "Found existing installation at $PLUGIN_DIR"
    echo "  Pulling latest changes..."
    (cd "$PLUGIN_DIR" && git pull --quiet 2>/dev/null) && \
      ok "Updated to latest version." || \
      warn "Could not pull updates. Continuing with existing version."
  else
    info "Cloning opencode-sfx..."
    if command -v git &>/dev/null; then
      mkdir -p "$(dirname "$PLUGIN_DIR")"
      git clone --quiet "$REPO_URL" "$PLUGIN_DIR" 2>/dev/null && \
        ok "Cloned to $PLUGIN_DIR" || \
        { err "Failed to clone repository. Check your internet connection."; exit 1; }
    else
      err "git is required but not found. Install git and try again."
      exit 1
    fi
  fi
fi

PLUGIN_PATH="$PLUGIN_DIR/plugin.ts"

# ---------------------------------------------------------------------------
# Install npm dependencies
# ---------------------------------------------------------------------------

echo ""
if [ -f "$PLUGIN_DIR/package.json" ]; then
  info "Installing dependencies..."
  if command -v npm &>/dev/null; then
    (cd "$PLUGIN_DIR" && npm install --silent) && \
      ok "Dependencies installed." || \
      warn "npm install failed — run 'npm install' manually in $PLUGIN_DIR"
  else
    warn "npm not found. Run 'npm install' manually in $PLUGIN_DIR"
  fi
fi

# ---------------------------------------------------------------------------
# Locate the OpenCode config
# ---------------------------------------------------------------------------

DEFAULT_CONFIG_DIR="$HOME/.config/opencode"
CONFIG_FILE=""

# Look for existing config in the default location
for ext in json jsonc; do
  candidate="$DEFAULT_CONFIG_DIR/opencode.$ext"
  if [ -f "$candidate" ]; then
    CONFIG_FILE="$candidate"
    break
  fi
done

if [ -n "$CONFIG_FILE" ]; then
  echo ""
  info "Found OpenCode config:"
  echo "  $CONFIG_FILE"
  if ! confirm "Use this config? [Y/n]"; then
    CONFIG_FILE=""
  fi
fi

if [ -z "$CONFIG_FILE" ]; then
  if [ "$AUTO_YES" = true ]; then
    # In auto mode, create default config if it doesn't exist
    CONFIG_FILE="$DEFAULT_CONFIG_DIR/opencode.json"
    if [ ! -f "$CONFIG_FILE" ]; then
      mkdir -p "$DEFAULT_CONFIG_DIR"
      echo '{}' > "$CONFIG_FILE"
      ok "Created new OpenCode config at $CONFIG_FILE"
    fi
  else
    echo ""
    read -rp "Path to your OpenCode config file: " CONFIG_FILE
    CONFIG_FILE="${CONFIG_FILE/#\~/$HOME}"

    if [ ! -f "$CONFIG_FILE" ]; then
      err "File not found: $CONFIG_FILE"
      exit 1
    fi
  fi
fi

CONFIG_DIR="$(dirname "$CONFIG_FILE")"

echo ""
info "Configuring OpenCode SFX..."
echo ""

# ---------------------------------------------------------------------------
# Add plugin to config
# ---------------------------------------------------------------------------

if grep -q "plugin.ts" "$CONFIG_FILE" 2>/dev/null; then
  # Check if it's specifically our plugin
  if grep -q "$PLUGIN_PATH" "$CONFIG_FILE" 2>/dev/null || \
     grep -q "opencode-sfx/plugin.ts" "$CONFIG_FILE" 2>/dev/null; then
    warn "Plugin already present in config — skipping."
  else
    warn "A different plugin.ts is already configured. You may need to add this plugin manually:"
    echo "  $PLUGIN_PATH"
  fi
else
  # Add the plugin entry to the config
  # Strategy: find "plugin": [...] and append, or add the key if missing
  if grep -q '"plugin"' "$CONFIG_FILE" 2>/dev/null; then
    # "plugin" key exists — append our path to the array
    if python3 -c "
import json, re, sys

path = sys.argv[1]
plugin = sys.argv[2]

with open(path) as f:
    raw = f.read()

# Strip JSONC comments (// style) for parsing
stripped = re.sub(r'//.*$', '', raw, flags=re.MULTILINE)
# Strip trailing commas before } or ]
stripped = re.sub(r',(\s*[}\]])', r'\1', stripped)
data = json.loads(stripped)

if plugin not in data.get('plugin', []):
    data.setdefault('plugin', []).append(plugin)

# Reconstruct: we re-serialize and try to preserve the original style.
# Since the config may have comments/trailing commas (JSONC), we do a
# targeted insertion instead of a full rewrite.

import re as _re
m = _re.search(r'\"plugin\"\s*:\s*\[', raw)
if m:
    # Find the closing bracket
    depth = 1
    i = m.end()
    while i < len(raw) and depth > 0:
        if raw[i] == '[': depth += 1
        elif raw[i] == ']': depth -= 1
        i += 1
    bracket_pos = i - 1  # position of ]

    # Check if array already has entries
    array_content = raw[m.end():bracket_pos].strip()
    if array_content:
        # Has entries - add after the last one with a comma
        insert_pos = bracket_pos
        while insert_pos > m.end() and raw[insert_pos-1] in ' \t\n\r':
            insert_pos -= 1
        # Detect indentation from existing entries
        lines = raw[m.end():bracket_pos].split('\n')
        indent = '    '
        for line in lines:
            stripped_line = line.strip()
            if stripped_line and stripped_line != '':
                indent = line[:len(line) - len(line.lstrip())]
                break
        comma = ',' if not raw[insert_pos-1] == ',' else ''
        insertion = comma + '\n' + indent + json.dumps(plugin) + ','
        new_raw = raw[:insert_pos] + insertion + '\n' + raw[bracket_pos:]
    else:
        # Empty array - add the entry
        indent = '    '
        insertion = '\n' + indent + json.dumps(plugin) + ',\n  '
        new_raw = raw[:bracket_pos] + insertion + raw[bracket_pos:]

    with open(path, 'w') as f:
        f.write(new_raw)
    sys.exit(0)
else:
    sys.exit(1)
" "$CONFIG_FILE" "$PLUGIN_PATH" 2>/dev/null; then
      ok "Added plugin to existing plugin array."
    else
      err "Could not automatically update the plugin array."
      echo "  Please add this to your config's \"plugin\" array manually:"
      echo "    \"$PLUGIN_PATH\""
    fi
  else
    # No "plugin" key — insert one
    if python3 -c "
import json, sys

path = sys.argv[1]
plugin = sys.argv[2]

with open(path) as f:
    raw = f.read()

# If it's a minimal {} (possibly with whitespace), just rewrite the whole file
stripped = raw.strip()
if stripped == '{}' or stripped == '':
    new_raw = '{\n  \"plugin\": [\n    ' + json.dumps(plugin) + '\n  ]\n}\n'
else:
    # Find the first { and insert after its line
    brace = raw.index('{')
    eol = raw.index('\n', brace)
    indent = '  '
    insertion = '\n' + indent + '\"plugin\": [\n' + indent + '  ' + json.dumps(plugin) + '\n' + indent + '],'
    new_raw = raw[:eol] + insertion + raw[eol:]

with open(path, 'w') as f:
    f.write(new_raw)
" "$CONFIG_FILE" "$PLUGIN_PATH" 2>/dev/null; then
      ok "Added plugin entry to config."
    else
      err "Could not automatically update config."
      echo "  Please add this to your OpenCode config manually:"
      echo ""
      echo "  \"plugin\": ["
      echo "    \"$PLUGIN_PATH\""
      echo "  ]"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Install /sfx command
# ---------------------------------------------------------------------------

echo ""

INSTALL_CMD=true
if [ "$AUTO_YES" = false ]; then
  info "The /sfx command lets you manage themes at runtime."
  echo "  It can be installed globally (~/.config/opencode/commands/)"
  echo "  or used locally from this project directory."
  echo ""
  if ! confirm "Install /sfx command globally? [Y/n]"; then
    INSTALL_CMD=false
  fi
fi

if [ "$INSTALL_CMD" = true ]; then
  COMMANDS_DIR="$CONFIG_DIR/commands"
  mkdir -p "$COMMANDS_DIR"
  cp "$PLUGIN_DIR/commands/sfx.md" "$COMMANDS_DIR/sfx.md"
  ok "Installed /sfx command to $COMMANDS_DIR/sfx.md"
else
  # Add command definition to local opencode.json so it works from project root
  LOCAL_CONFIG="$PLUGIN_DIR/opencode.json"

  if grep -q '"command"' "$LOCAL_CONFIG" 2>/dev/null; then
    ok "/sfx command already defined in local opencode.json."
  else
    python3 -c "
import json, re, sys

path = sys.argv[1]
with open(path) as f:
    raw = f.read()

# Strip trailing commas for parsing
stripped = re.sub(r',(\s*[}\]])', r'\1', raw)
data = json.loads(stripped)

data['command'] = {
    'sfx': {
        'description': 'Manage sound effect themes',
        'template': open(sys.argv[2]).read().split('---', 2)[2].strip()
    }
}

with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" "$LOCAL_CONFIG" "$PLUGIN_DIR/commands/sfx.md" 2>/dev/null && \
      ok "Added /sfx command to local opencode.json." || \
      warn "Could not update local opencode.json. The /sfx command file is at: commands/sfx.md"
  fi

  echo ""
  warn "The /sfx command will only be available when running opencode from:"
  echo "  $PLUGIN_DIR"
fi

# ---------------------------------------------------------------------------
# Symlink CLI to PATH
# ---------------------------------------------------------------------------

echo ""
CLI_BIN="$PLUGIN_DIR/bin/opencode-sfx"
if [ -x "$CLI_BIN" ]; then
  # Try common user-local bin directories
  LINK_DIR=""
  for candidate in "$HOME/.local/bin" "/usr/local/bin"; do
    if [ -d "$candidate" ]; then
      LINK_DIR="$candidate"
      break
    fi
  done

  if [ -n "$LINK_DIR" ]; then
    LINK_TARGET="$LINK_DIR/opencode-sfx"
    if [ -L "$LINK_TARGET" ] || [ -f "$LINK_TARGET" ]; then
      ok "CLI already available at $LINK_TARGET"
    else
      if ln -sf "$CLI_BIN" "$LINK_TARGET" 2>/dev/null; then
        ok "CLI linked: $LINK_TARGET"
      else
        warn "Could not symlink CLI to $LINK_DIR (permission denied)."
        echo "  You can run the CLI directly: $CLI_BIN"
      fi
    fi
  else
    warn "No standard bin directory found (~/.local/bin or /usr/local/bin)."
    echo "  You can run the CLI directly: $CLI_BIN"
  fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${NC}"
echo ""
echo "  Restart OpenCode to load the plugin."
echo "  A default notification theme is included — sounds work out of the box."
echo ""
echo "  Run /sfx in the TUI to manage themes."
echo ""
