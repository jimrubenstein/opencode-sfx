#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# OpenCode SFX - Installer
# ---------------------------------------------------------------------------
# Installs sound effects for AI coding agents. Detects which clients you have
# installed (OpenCode, Claude Code, Gemini CLI, Codex) and configures each.
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
echo "  Sound effects for AI coding agents"
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
# Detect and configure other AI coding agent clients
# ---------------------------------------------------------------------------

echo ""
info "Checking for other AI coding agent clients..."
echo ""

# --- Claude Code ---
CLAUDE_DETECTED=false
CLAUDE_CONFIG_DIR_PATH="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

if command -v claude &>/dev/null; then
  CLAUDE_DETECTED=true
elif [ -d "$CLAUDE_CONFIG_DIR_PATH" ]; then
  CLAUDE_DETECTED=true
fi

if [ "$CLAUDE_DETECTED" = true ]; then
  INSTALL_CLAUDE=false
  CLAUDE_SETTINGS="$CLAUDE_CONFIG_DIR_PATH/settings.json"
  HOOK_CMD="$PLUGIN_DIR/integrations/claude-code/hook.sh"

  if [ "$AUTO_YES" = true ]; then
    INSTALL_CLAUDE=true
  else
    echo -e "  ${GREEN}Found:${NC} Claude Code ($CLAUDE_CONFIG_DIR_PATH)"
    echo "  Events: task complete, permission request, errors, startup"
    if confirm "  Configure Claude Code? [Y/n]"; then
      INSTALL_CLAUDE=true
    fi
  fi

  if [ "$INSTALL_CLAUDE" = true ]; then
    # Check if hooks are already configured
    if [ -f "$CLAUDE_SETTINGS" ] && grep -q "opencode-sfx" "$CLAUDE_SETTINGS" 2>/dev/null; then
      warn "Claude Code hooks already configured — skipping."
    else
      mkdir -p "$CLAUDE_CONFIG_DIR_PATH"

      # Build hooks JSON and merge into settings
      if python3 -c "
import json, sys, os

settings_path = sys.argv[1]
hook_cmd = sys.argv[2]

# Load existing settings or start fresh
if os.path.exists(settings_path):
    with open(settings_path) as f:
        data = json.load(f)
else:
    data = {}

hooks = data.setdefault('hooks', {})

# Only add hooks that aren't already present
hook_entry = lambda: [{'hooks': [{'type': 'command', 'command': hook_cmd}]}]
startup_entry = lambda: [{'matcher': 'startup', 'hooks': [{'type': 'command', 'command': hook_cmd}]}]

if 'Stop' not in hooks:
    hooks['Stop'] = hook_entry()
if 'SubagentStop' not in hooks:
    hooks['SubagentStop'] = []  # explicitly empty — no sounds for subagents
if 'PermissionRequest' not in hooks:
    hooks['PermissionRequest'] = hook_entry()
if 'PostToolUseFailure' not in hooks:
    hooks['PostToolUseFailure'] = hook_entry()
if 'SessionStart' not in hooks:
    hooks['SessionStart'] = startup_entry()

with open(settings_path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" "$CLAUDE_SETTINGS" "$HOOK_CMD" 2>/dev/null; then
        ok "Configured Claude Code hooks in $CLAUDE_SETTINGS"
      else
        err "Could not configure Claude Code automatically."
        echo "  See: $PLUGIN_DIR/integrations/claude-code/hook.sh"
      fi
    fi
  fi
else
  echo "  Claude Code — not found"
fi

# --- Gemini CLI ---
GEMINI_DETECTED=false
GEMINI_CONFIG_DIR_PATH="${GEMINI_CLI_HOME:-$HOME/.gemini}"

if command -v gemini &>/dev/null; then
  GEMINI_DETECTED=true
elif [ -d "$GEMINI_CONFIG_DIR_PATH" ]; then
  GEMINI_DETECTED=true
fi

if [ "$GEMINI_DETECTED" = true ]; then
  INSTALL_GEMINI=false
  GEMINI_SETTINGS="$GEMINI_CONFIG_DIR_PATH/settings.json"
  HOOK_CMD="$PLUGIN_DIR/integrations/gemini-cli/hook.sh"

  if [ "$AUTO_YES" = true ]; then
    INSTALL_GEMINI=true
  else
    echo -e "  ${GREEN}Found:${NC} Gemini CLI ($GEMINI_CONFIG_DIR_PATH)"
    echo "  Events: task complete, notifications, startup"
    if confirm "  Configure Gemini CLI? [Y/n]"; then
      INSTALL_GEMINI=true
    fi
  fi

  if [ "$INSTALL_GEMINI" = true ]; then
    if [ -f "$GEMINI_SETTINGS" ] && grep -q "opencode-sfx" "$GEMINI_SETTINGS" 2>/dev/null; then
      warn "Gemini CLI hooks already configured — skipping."
    else
      mkdir -p "$GEMINI_CONFIG_DIR_PATH"

      if python3 -c "
import json, sys, os

settings_path = sys.argv[1]
hook_cmd = sys.argv[2]

if os.path.exists(settings_path):
    with open(settings_path) as f:
        data = json.load(f)
else:
    data = {}

hooks = data.setdefault('hooks', {})

def make_hook(event_name):
    return [{'hooks': [{'type': 'command', 'command': f'{hook_cmd} {event_name}', 'timeout': 5000}]}]

def make_startup_hook(event_name):
    return [{'matcher': 'startup', 'hooks': [{'type': 'command', 'command': f'{hook_cmd} {event_name}', 'timeout': 5000}]}]

if 'AfterAgent' not in hooks:
    hooks['AfterAgent'] = make_hook('AfterAgent')
if 'Notification' not in hooks:
    hooks['Notification'] = make_hook('Notification')
if 'SessionStart' not in hooks:
    hooks['SessionStart'] = make_startup_hook('SessionStart')

with open(settings_path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" "$GEMINI_SETTINGS" "$HOOK_CMD" 2>/dev/null; then
        ok "Configured Gemini CLI hooks in $GEMINI_SETTINGS"
      else
        err "Could not configure Gemini CLI automatically."
        echo "  See: $PLUGIN_DIR/integrations/gemini-cli/hook.sh"
      fi
    fi
  fi
else
  echo "  Gemini CLI — not found"
fi

# --- Codex ---
CODEX_DETECTED=false
CODEX_HOME_PATH="${CODEX_HOME:-$HOME/.codex}"

if command -v codex &>/dev/null; then
  CODEX_DETECTED=true
elif [ -d "$CODEX_HOME_PATH" ]; then
  CODEX_DETECTED=true
fi

if [ "$CODEX_DETECTED" = true ]; then
  INSTALL_CODEX=false
  CODEX_CONFIG="$CODEX_HOME_PATH/config.toml"
  NOTIFY_CMD="$PLUGIN_DIR/integrations/codex/notify.sh"

  if [ "$AUTO_YES" = true ]; then
    INSTALL_CODEX=true
  else
    echo -e "  ${GREEN}Found:${NC} Codex CLI ($CODEX_HOME_PATH)"
    echo "  Events: task complete only (limited)"
    if confirm "  Configure Codex CLI? [Y/n]"; then
      INSTALL_CODEX=true
    fi
  fi

  if [ "$INSTALL_CODEX" = true ]; then
    if [ -f "$CODEX_CONFIG" ] && grep -q "opencode-sfx" "$CODEX_CONFIG" 2>/dev/null; then
      warn "Codex CLI notify already configured — skipping."
    else
      mkdir -p "$CODEX_HOME_PATH"

      if [ -f "$CODEX_CONFIG" ] && grep -q "^notify" "$CODEX_CONFIG" 2>/dev/null; then
        warn "Codex config already has a 'notify' entry."
        echo "  To use opencode-sfx, set notify in $CODEX_CONFIG to:"
        echo "  notify = [\"$NOTIFY_CMD\"]"
      else
        # Append notify line to config (or create the file)
        echo "" >> "$CODEX_CONFIG"
        echo "# opencode-sfx: play sound on agent turn complete" >> "$CODEX_CONFIG"
        echo "notify = [\"$NOTIFY_CMD\"]" >> "$CODEX_CONFIG"
        ok "Configured Codex CLI notify in $CODEX_CONFIG"
      fi
    fi
  fi
else
  echo "  Codex CLI — not found"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${NC}"
echo ""
echo "  A default notification theme is included — sounds work out of the box."
echo ""
echo "  Restart your AI coding agent to activate sound effects."
echo "  In OpenCode, run /sfx to manage themes."
echo ""
