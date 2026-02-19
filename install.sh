#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# OpenCode SFX - Installer
# ---------------------------------------------------------------------------
# Adds the plugin to the user's global OpenCode config and optionally
# installs the /sfx slash command.
# ---------------------------------------------------------------------------

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_PATH="$PLUGIN_DIR/plugin.ts"

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
  echo ""
  read -rp "Use this config? [Y/n] " answer
  if [[ "$answer" =~ ^[Nn] ]]; then
    CONFIG_FILE=""
  fi
fi

if [ -z "$CONFIG_FILE" ]; then
  echo ""
  read -rp "Path to your OpenCode config file: " CONFIG_FILE
  CONFIG_FILE="${CONFIG_FILE/#\~/$HOME}"

  if [ ! -f "$CONFIG_FILE" ]; then
    err "File not found: $CONFIG_FILE"
    exit 1
  fi
fi

CONFIG_DIR="$(dirname "$CONFIG_FILE")"

echo ""
info "Installing OpenCode SFX..."
echo ""

# ---------------------------------------------------------------------------
# Check if plugin is already installed
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
    # Find the last entry in the plugin array and add after it
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

# Find the plugin array in the raw text and insert
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
        # Find last non-whitespace before ]
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
    # No "plugin" key — insert one after the opening {
    if python3 -c "
import json, sys

path = sys.argv[1]
plugin = sys.argv[2]

with open(path) as f:
    raw = f.read()

# Find the first { and insert after it
brace = raw.index('{')
# Find the end of the line containing {
eol = raw.index('\n', brace)
indent = '  '
insertion = '\n' + indent + '\"plugin\": [\n' + indent + '  ' + json.dumps(plugin) + ',\n' + indent + '],'
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
info "The /sfx command lets you manage themes at runtime."
echo "  It can be installed globally (~/.config/opencode/commands/)"
echo "  or used locally from this project directory."
echo ""
read -rp "Install /sfx command globally? [Y/n] " install_cmd

if [[ "$install_cmd" =~ ^[Nn] ]]; then
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
else
  COMMANDS_DIR="$CONFIG_DIR/commands"
  mkdir -p "$COMMANDS_DIR"
  cp "$PLUGIN_DIR/commands/sfx.md" "$COMMANDS_DIR/sfx.md"
  ok "Installed /sfx command to $COMMANDS_DIR/sfx.md"
fi

# ---------------------------------------------------------------------------
# npm install
# ---------------------------------------------------------------------------

echo ""
if [ -f "$PLUGIN_DIR/package.json" ]; then
  info "Installing dependencies..."
  (cd "$PLUGIN_DIR" && npm install --silent 2>/dev/null) && \
    ok "Dependencies installed." || \
    warn "npm install failed — run 'npm install' manually in $PLUGIN_DIR"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${NC}"
echo ""
echo "  Restart opencode to load the plugin."
echo "  Run /sfx in the TUI to manage themes."
echo ""
