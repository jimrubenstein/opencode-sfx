#!/usr/bin/env bash
# =============================================================================
# Build Theme Packs
# =============================================================================
#
# Creates distributable zip files for each StarCraft theme, bundling the theme
# YAML definition, sound files, and an INSTALL.md.
#
# Usage:
#   ./scripts/build-theme-packs.sh [output-dir] [sounds-dir]
#
# Defaults:
#   output-dir:  ../opencode-sfx-packs/
#   sounds-dir:  ~/sounds/starcraft/mp3_trimmed/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
THEMES_DIR="$PROJECT_DIR/themes"

OUTPUT_DIR="${1:-$(cd "$PROJECT_DIR/.." && pwd)/opencode-sfx-packs}"
SOUNDS_DIR="${2:-$HOME/sounds/starcraft/mp3_trimmed}"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BOLD}$1${NC}"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }

# StarCraft themes to pack (everything except default and test)
STARCRAFT_THEMES=(
  marine ghost siege-tank battlecruiser wraith scv firebat
  goliath vulture dropship science-vessel advisor raynor kerrigan duke comedy
)

# ---------------------------------------------------------------------------
# INSTALL.md template
# ---------------------------------------------------------------------------

generate_install_md() {
  local theme_name="$1"
  local theme_key="$2"
  local theme_desc="$3"

  cat <<INSTALLEOF
# ${theme_name} — Theme Pack for OpenCode SFX

${theme_desc}

## Install

### Automatic (recommended)

Use the OpenCode SFX theme installer:

\`\`\`bash
opencode-sfx install ${theme_key}.zip
\`\`\`

Or install from a URL:

\`\`\`bash
opencode-sfx install https://example.com/themes/${theme_key}.zip
\`\`\`

### Manual

1. Copy the theme YAML to your themes directory:

   \`\`\`bash
   cp themes/${theme_key}.yaml ~/.config/opencode/plugins/opencode-sfx/themes/
   \`\`\`

2. Copy the sound files to your sounds directory:

   \`\`\`bash
   mkdir -p ~/sounds/starcraft/mp3_trimmed
   cp sounds/*.mp3 ~/sounds/starcraft/mp3_trimmed/
   \`\`\`

3. Reload themes in your AI coding agent:

   \`\`\`
   /sfx reload
   /sfx change ${theme_key}
   \`\`\`

## Contents

- \`themes/${theme_key}.yaml\` — Theme definition
- \`sounds/\` — Sound files referenced by the theme
- \`INSTALL.md\` — This file
INSTALLEOF
}

# ---------------------------------------------------------------------------
# Extract sound filenames from a theme YAML
# ---------------------------------------------------------------------------

get_theme_sounds() {
  local theme_file="$1"
  local in_sounds=false

  while IFS= read -r line; do
    if [[ "$line" =~ ^sounds: ]]; then
      in_sounds=true
      continue
    fi

    if [[ "$in_sounds" != true ]]; then
      continue
    fi

    # Inline value: "  key: filename.mp3"
    if [[ "$line" =~ ^[[:space:]]{2}[a-z]+:[[:space:]]+(.+\.mp3) ]]; then
      echo "${BASH_REMATCH[1]}"
      continue
    fi

    # List item: "    - filename.mp3"
    if [[ "$line" =~ ^[[:space:]]{4}-[[:space:]]+(.+\.mp3) ]]; then
      echo "${BASH_REMATCH[1]}"
      continue
    fi

    # Non-indented line ends the sounds block
    if [[ "$in_sounds" == true && ! "$line" =~ ^[[:space:]] && -n "$line" ]]; then
      break
    fi
  done < "$theme_file"
}

get_theme_field() {
  local theme_file="$1"
  local field="$2"
  grep "^${field}:" "$theme_file" | sed "s/^${field}:[[:space:]]*//"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "Building theme packs"
echo "  Themes dir: $THEMES_DIR"
echo "  Sounds dir: $SOUNDS_DIR"
echo "  Output dir: $OUTPUT_DIR"
echo ""

mkdir -p "$OUTPUT_DIR"

if [[ ! -d "$SOUNDS_DIR" ]]; then
  err "Sounds directory not found: $SOUNDS_DIR"
  exit 1
fi

BUILT=0
SKIPPED=0

for theme_key in "${STARCRAFT_THEMES[@]}"; do
  theme_file="$THEMES_DIR/$theme_key.yaml"

  if [[ ! -f "$theme_file" ]]; then
    warn "Theme file not found: $theme_file — skipping"
    ((SKIPPED++))
    continue
  fi

  theme_name=$(get_theme_field "$theme_file" "name")
  theme_desc=$(get_theme_field "$theme_file" "description")

  # Create temp build directory
  build_dir=$(mktemp -d)
  trap "rm -rf '$build_dir'" EXIT

  mkdir -p "$build_dir/themes"
  mkdir -p "$build_dir/sounds"

  # Copy theme YAML
  cp "$theme_file" "$build_dir/themes/"

  # Copy sound files
  sound_files=$(get_theme_sounds "$theme_file" | sort -u)
  missing=0

  while IFS= read -r sound_file; do
    [[ -z "$sound_file" ]] && continue
    src="$SOUNDS_DIR/$sound_file"
    if [[ -f "$src" ]]; then
      cp "$src" "$build_dir/sounds/"
    else
      warn "  Missing sound: $sound_file"
      ((missing++))
    fi
  done <<< "$sound_files"

  if [[ $missing -gt 0 ]]; then
    warn "Theme $theme_key has $missing missing sounds — packing anyway"
  fi

  # Generate INSTALL.md
  generate_install_md "$theme_name" "$theme_key" "$theme_desc" > "$build_dir/INSTALL.md"

  # Create archive (tgz by default, zip as fallback)
  sound_count=$(find "$build_dir/sounds" -name '*.mp3' | wc -l | tr -d ' ')

  tgz_file="$OUTPUT_DIR/$theme_key.tgz"
  (cd "$build_dir" && tar czf "$tgz_file" themes/ sounds/ INSTALL.md)
  ok "$theme_key.tgz ($sound_count sounds)"

  # Cleanup temp dir
  rm -rf "$build_dir"
  trap - EXIT

  ((BUILT++))
done

echo ""
info "Done: $BUILT packs built, $SKIPPED skipped"
echo "  Output: $OUTPUT_DIR"
echo ""
ls -lh "$OUTPUT_DIR"/*.tgz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
